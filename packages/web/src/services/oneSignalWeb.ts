/**
 * oneSignalWeb.ts — Real OneSignal Web SDK integration (Phase 4)
 *
 * This file lives in packages/web because react-onesignal is a web-only dependency.
 * Core's NotificationService handles platform-agnostic scoring logic;
 * this module handles browser-specific OneSignal SDK calls.
 */

import OneSignal from 'react-onesignal';
import type { UserProfile } from '@seame/core';

let initialized = false;

/**
 * Probe the global OneSignal SDK instance directly. The wrapper's `initialized`
 * flag can get out of sync with reality when:
 *   • `OneSignal.init()` throws "already initialized" on the second call
 *     (React StrictMode double-mount, fast refresh), so we keep our flag
 *     `false` even though the SDK itself is perfectly fine.
 *   • An auto-heal cycle partially completes but the `initialized = true`
 *     assignment is skipped because an error was thrown after init.
 *
 * This helper reads the SDK's own state so the ID-capture and permission
 * paths can proceed even when our wrapper flag is stale.
 */
function sdkIsLive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const g = (window as unknown as { OneSignal?: { initialized?: boolean; User?: { PushSubscription?: unknown } } }).OneSignal;
    if (!g) return false;
    if (g.initialized === true) return true;
    // Some react-onesignal builds don't expose `initialized` on the global.
    // Fall back to feature detection — if PushSubscription is reachable,
    // the SDK has finished bootstrapping.
    return !!g.User?.PushSubscription;
  } catch {
    return false;
  }
}

// ─── Corruption detection + IndexedDB self-healing ──────────────────────
//
// Symptom (April 2026 QA sweep): DevTools shows OneSignal generating a
// `"local-<uuid>"` Player ID and throwing `Unrecognized operation:
// login-user`. Both are classic fingerprints of a half-written IndexedDB
// store left behind by one-too-many Service Worker unregistrations (the
// SDK keeps its user/subscription caches in a database literally named
// `"OneSignal"`). Once that store is corrupted the SDK enters a stuck
// state that no amount of re-initialisation can recover from — the only
// cure is to drop the database so the next `init()` rebuilds it from
// scratch.
//
// The utilities below detect and remediate that state. `wipeOneSignalIndexedDB`
// is idempotent and safe to call while the SDK is uninitialised.

const ONESIGNAL_DB_NAMES = [
  // The primary store used by Web SDK v16+.
  'OneSignal',
  // Legacy stores carried over from earlier SDK versions. Removing them
  // too means a wipe genuinely resets the user to a clean slate.
  'OneSignalSDK',
  'OneSignalSDKDB',
  'ONE_SIGNAL_SDK_DB',
];

/**
 * Wipe every OneSignal IndexedDB database in the browser.
 *
 * Used by the "Reset Push State" debug button in `AlertConfigModal`
 * (Phase 2 of the push-pipeline audit) and by `initOneSignalWeb` when a
 * corrupted state is auto-detected. Returns the list of databases that
 * were actually deleted so the caller can surface a meaningful message.
 *
 * Implementation notes:
 *   • Chromium exposes `indexedDB.databases()` which lets us enumerate
 *     everything the SDK might have created under an alternate name.
 *     Firefox/Safari don't, so we fall back to deleting the well-known
 *     names listed above.
 *   • `deleteDatabase` resolves with `onsuccess` even when the DB didn't
 *     exist — we treat that as a successful no-op and move on.
 *   • We wrap each delete in its own timeout so one stuck tab holding an
 *     open connection doesn't hang the whole reset flow.
 */
export async function wipeOneSignalIndexedDB(): Promise<string[]> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    console.warn('[OneSignalWeb] wipeOneSignalIndexedDB: IndexedDB unavailable');
    return [];
  }

  // Build the set of DB names to delete. Start with the well-known ones
  // and then try to enumerate the rest via the Chromium-only API.
  const names = new Set<string>(ONESIGNAL_DB_NAMES);
  try {
    const idbMaybe = (window.indexedDB as unknown as {
      databases?: () => Promise<Array<{ name?: string }>>;
    });
    if (typeof idbMaybe.databases === 'function') {
      const listing = await idbMaybe.databases();
      for (const entry of listing) {
        if (entry?.name && entry.name.toLowerCase().includes('onesignal')) {
          names.add(entry.name);
        }
      }
    }
  } catch (err) {
    // Enumeration is best-effort. Missing it just means we're limited to
    // the hard-coded allow-list above.
    console.debug('[OneSignalWeb] indexedDB.databases() unavailable', err);
  }

  const deleteOne = (name: string) =>
    new Promise<string | null>((resolve) => {
      let settled = false;
      const done = (result: string | null) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      try {
        const req = window.indexedDB.deleteDatabase(name);
        req.onsuccess = () => done(name);
        req.onerror = () => {
          console.warn(`[OneSignalWeb] deleteDatabase("${name}") errored`, req.error);
          done(null);
        };
        req.onblocked = () => {
          console.warn(
            `[OneSignalWeb] deleteDatabase("${name}") blocked — another tab likely has it open`,
          );
          // Don't hang forever — close out as "tried but blocked".
          setTimeout(() => done(null), 1500);
        };
      } catch (err) {
        console.warn(`[OneSignalWeb] deleteDatabase("${name}") threw`, err);
        done(null);
      }
      // Hard timeout so a stuck request can't wedge the caller.
      setTimeout(() => done(null), 3000);
    });

  const deleted: string[] = [];
  for (const name of names) {
    const result = await deleteOne(name);
    if (result) deleted.push(result);
  }

  // SDK state flag must be reset too — otherwise a subsequent `initOneSignalWeb`
  // call inside the same page load would short-circuit on the `initialized`
  // guard and leave the wiped database un-seeded.
  initialized = false;

  console.log('[OneSignalWeb] wipeOneSignalIndexedDB complete', { deleted });
  return deleted;
}

/**
 * Session-scoped guard so the scorched-earth healer only runs once per
 * page load. If the `local-` ID *still* appears after a wipe + reload,
 * something deeper is wrong and looping forever would trap the user in a
 * reload cycle. We use sessionStorage so the guard survives the intentional
 * `location.reload()` below but doesn't carry over into a fresh session.
 */
const SCORCHED_EARTH_FLAG = '__seayou_onesignal_scorched_earth__';

/**
 * Scorched-earth auto-healer.
 *
 * Triggered when we detect the `"local-<uuid>"` Player ID, which is the
 * unambiguous fingerprint of a corrupted OneSignal IndexedDB. At that
 * point the SDK will:
 *   • Keep trying to sync tags under a non-server ID → 400 Bad Request
 *   • Attempt to reconcile the subscription → 409 Conflict
 *   • Never resolve a real Player ID for us to persist
 *
 * The only reliable recovery is to nuke the local DBs and force a full
 * page reload so the SDK bootstraps from scratch against the server. We
 * do that aggressively here — ignoring our own `initialized` flag and any
 * in-flight promises — because once this state is reached there is nothing
 * useful the app can do without a reset.
 *
 * The `SCORCHED_EARTH_FLAG` sessionStorage key prevents infinite reload
 * loops: if the first wipe-and-reload didn't fix it, we log loudly and
 * let the user click the manual "Reset push state" button in the modal.
 */
export async function scorchedEarthReset(reason: string): Promise<void> {
  if (typeof window === 'undefined') return;

  // Guard: only run once per session to avoid a reload loop.
  try {
    if (window.sessionStorage.getItem(SCORCHED_EARTH_FLAG) === '1') {
      console.error(
        '[OneSignalWeb] Scorched-earth reset already attempted this session but corrupted state persists. ' +
        'Stopping to avoid a reload loop. Ask the user to Clear Site Data (Application → Storage) manually.',
        { reason },
      );
      // Flip the internal flag so the app at least stops trying to init.
      initialized = false;
      return;
    }
    window.sessionStorage.setItem(SCORCHED_EARTH_FLAG, '1');
  } catch {
    /* sessionStorage may be unavailable in strict modes — fall through. */
  }

  console.warn('[OneSignalWeb] SCORCHED EARTH triggered:', reason);

  // Direct deletes first — they are synchronous-enough that we don't
  // have to wait on them, but awaiting makes the order deterministic.
  try {
    await wipeOneSignalIndexedDB();
  } catch (err) {
    console.warn('[OneSignalWeb] wipeOneSignalIndexedDB threw during scorched-earth:', err);
  }

  // Belt-and-suspenders explicit deletes for the two well-known v16 stores
  // the user called out, even though wipeOneSignalIndexedDB already covers
  // them. If one of these still has an open connection the best-effort
  // delete will just no-op — the reload below resets everything anyway.
  for (const name of ['OneSignal', 'OneSignalSDKDB']) {
    try { window.indexedDB.deleteDatabase(name); } catch { /* no-op */ }
  }

  // Unregister every service worker registration the page knows about so
  // the next load starts with a clean SW slate. Without this, VitePWA's
  // `sw.js` or a stale OneSignal worker can re-seed the corrupted state
  // from its own cache and undo the IndexedDB wipe.
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      console.log('[OneSignalWeb] Unregistered service workers:', regs.length);
    }
  } catch (err) {
    console.warn('[OneSignalWeb] SW unregister failed during scorched-earth:', err);
  }

  // Force a full reload. The next boot lands on a clean SDK: empty
  // IndexedDB, fresh SW registration, and Vercel serves the worker with
  // the correct MIME (thanks to `vercel.json` headers).
  console.warn('[OneSignalWeb] Reloading to complete scorched-earth reset…');
  window.location.reload();
}

/**
 * Heuristic sniff for the "corrupted IndexedDB" state. Returns `true` when
 * the SDK has clearly entered its "local-<uuid>" degraded mode — a signal
 * that re-init will fail and we should wipe first.
 *
 * We deliberately keep this conservative: a false negative just means the
 * user has to click the debug button; a false positive would wipe a
 * working push registration and frustrate the user.
 */
export function detectCorruptedOneSignalState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const id = OneSignal?.User?.PushSubscription?.id;
    if (typeof id === 'string' && id.startsWith('local-')) {
      return true;
    }
  } catch {
    /* SDK not loaded yet — can't tell, don't assume broken. */
  }
  return false;
}

/**
 * Initialize the OneSignal Web SDK.
 * Call once at app startup (e.g. in App.tsx useEffect).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initOneSignalWeb(appId?: string): Promise<void> {
  if (initialized) {
    console.log('[OneSignalWeb] Already initialized, skipping');
    return;
  }

  // Guard against the "double-init" failure mode: in React StrictMode (dev)
  // and after fast refresh, this function can be invoked twice before our
  // `initialized` flag is written. The second `OneSignal.init()` call
  // throws "OneSignal is already initialized", our catch-all then wrote
  // the SDK off as dead — which locked `waitForPlayerId` out of a perfectly
  // working handshake. Reading the SDK's own state lets us short-circuit
  // cleanly: sync our flag, skip the init call, carry on.
  if (sdkIsLive()) {
    initialized = true;
    console.log('[OneSignalWeb] SDK already live on window.OneSignal — syncing wrapper flag, skipping init');
    return;
  }

  const id = appId || (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ONESIGNAL_APP_ID;
  if (!id || id === 'YOUR_ONESIGNAL_APP_ID') {
    console.warn(
      '[OneSignalWeb] No OneSignal App ID configured. Set VITE_ONESIGNAL_APP_ID in .env to enable push notifications.'
    );
    return;
  }

  try {
    await OneSignal.init({
      appId: id,
      allowLocalhostAsSecureOrigin: true,
      // NOTE: we previously tried pointing OneSignal at VitePWA's merged
      // `sw.js` via `serviceWorkerPath`/`serviceWorkerParam`. In practice
      // the v16 SDK still probes for `/OneSignalSDKWorker.js` before it
      // reads those options — when that file is missing, Vercel's SPA
      // fallback returns `index.html` with `text/html`, which hard-aborts
      // the SDK with a MIME error. We now keep the default path and
      // ship `public/OneSignalSDKWorker.js` so the file resolves cleanly.
    });
    initialized = true;
    console.log('[OneSignalWeb] Initialized successfully with appId:', id);

    // Post-init corruption check — if the SDK came up in the "local-<uuid>"
    // degraded state, a soft in-page re-init is NOT enough (we tried that,
    // tags still 400/409 because the corrupted user record carries over in
    // IndexedDB). Escalate to the scorched-earth healer: wipe all OneSignal
    // IndexedDB stores, unregister every service worker, force a full page
    // reload. Session-scoped flag inside scorchedEarthReset() prevents a
    // reload loop if something outside our control keeps re-creating the
    // corrupted state.
    if (detectCorruptedOneSignalState()) {
      await scorchedEarthReset('detectCorruptedOneSignalState() returned true after init');
      return;
    }
  } catch (err) {
    // "OneSignal is already initialized" is the race-condition symptom, not
    // a real failure. The SDK is perfectly fine; we just need to sync our
    // wrapper flag so downstream calls (waitForPlayerId, getPlayerId) are
    // not incorrectly rejected.
    const msg = err instanceof Error ? err.message : String(err);
    if (/already initialized/i.test(msg) || sdkIsLive()) {
      initialized = true;
      console.warn('[OneSignalWeb] Treating init error as benign double-init — SDK is live:', msg);
      return;
    }
    console.error('[OneSignalWeb] Initialization failed:', err);
  }
}

/**
 * Request push notification permission from the browser.
 * Returns true if the user granted permission.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!initialized && !sdkIsLive()) {
    console.warn('[OneSignalWeb] Not initialized — call initOneSignalWeb() first');
    // Fallback to native Notification API for testing
    if ('Notification' in window) {
      const result = await Notification.requestPermission();
      console.log('[OneSignalWeb] Fallback Notification.requestPermission():', result);
      return result === 'granted';
    }
    return false;
  }

  try {
    await OneSignal.Notifications.requestPermission();
    const granted = OneSignal.Notifications.permission;
    console.log('[OneSignalWeb] Permission result:', granted);
    return granted;
  } catch (err) {
    console.error('[OneSignalWeb] Permission request failed:', err);
    return false;
  }
}

/**
 * Register a user profile with OneSignal via tags for segmented push targeting.
 */
export function registerUserTags(profile: UserProfile): void {
  if (!initialized && !sdkIsLive()) {
    console.warn('[OneSignalWeb] Not initialized — tags will not be applied');
    return;
  }

  // Scorched-earth intercept: if we're about to sync tags against a
  // corrupted `local-<uuid>` subscription, every addTag call will either
  // 400 (unknown user) or 409 (conflicting record). Don't even try —
  // wipe + reload instead.
  if (detectCorruptedOneSignalState()) {
    console.error('[OneSignalWeb] registerUserTags aborted — corrupted local-ID detected. Triggering reset.');
    void scorchedEarthReset('registerUserTags saw local-<uuid>');
    return;
  }

  // Helper: run a tag call and *never* let a 409 Conflict (or any other
  // transient tag-sync error) cascade and break the rest of the app. The
  // user-visible consequence of a failed tag write is "segmented pushes
  // miss this user" — nowhere close to the "UI stuck, ID never captured"
  // cascade we saw when a 409 from `addTags` bubbled up.
  const safeTag = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code =
        (err as { status?: number })?.status ??
        (err as { statusCode?: number })?.statusCode;
      if (code === 409 || /409|conflict/i.test(msg)) {
        console.warn(`[OneSignalWeb] ${label} returned 409 Conflict — ignoring (tag already set or user record racing):`, msg);
        return;
      }
      console.warn(`[OneSignalWeb] ${label} failed (non-fatal):`, err);
    }
  };

  safeTag('addTag(persona)',     () => OneSignal.User.addTag('persona', profile.userType));
  safeTag('addTag(userId)',      () => OneSignal.User.addTag('userId', profile.id));
  safeTag('addTag(minScore)',    () => OneSignal.User.addTag('minScore', String(profile.notificationThresholds.minScore)));
  safeTag('addTag(notifyHours)', () => OneSignal.User.addTag('notifyHours', String(profile.notificationThresholds.notifyHoursInAdvance)));

  // Tag favorite spots (up to 5)
  const spotTags: Record<string, string> = {};
  profile.favoriteSpots.slice(0, 5).forEach((spot, i) => {
    spotTags[`spot_${i}_lat`] = spot.lat.toFixed(4);
    spotTags[`spot_${i}_lon`] = spot.lon.toFixed(4);
    spotTags[`spot_${i}_name`] = spot.name;
  });
  safeTag('addTags(spots)', () => OneSignal.User.addTags(spotTags));

  console.log('[OneSignalWeb] User tags registered (best-effort):', profile.id, profile.userType);
}

/**
 * Check if OneSignal is initialized and permission is granted.
 */
export function isNotificationReady(): boolean {
  if (!initialized && !sdkIsLive()) return false;
  try {
    return OneSignal.Notifications.permission;
  } catch {
    return false;
  }
}

/**
 * Retrieve the user's OneSignal Player / Subscription ID.
 *
 * Returns null until the user has granted permission and OneSignal has
 * completed its handshake. Because the SDK populates this asynchronously
 * (and sometimes fires `change` events just after permission is granted),
 * callers commonly poll briefly via `waitForPlayerId()` rather than relying
 * on a single synchronous read.
 */
export function getPlayerId(): string | null {
  // Relaxed gate: if the SDK exposes `User.PushSubscription`, the ID is
  // reachable whether or not our wrapper flag was flipped. Blocking on the
  // flag alone caused the "double-init" regression (see `initOneSignalWeb`)
  // to hide a perfectly valid Player ID from the caller.
  if (!initialized && !sdkIsLive()) return null;
  try {
    // react-onesignal v3 / OneSignal Web SDK v16+:
    //   OneSignal.User.PushSubscription.id
    // Older SDKs exposed `OneSignal.getUserId()` — not used here.
    const id = OneSignal.User?.PushSubscription?.id;
    if (typeof id === 'string' && id.length > 0) {
      // Hard intercept — a `local-<uuid>` ID means the SDK has entered
      // its corrupted state. Returning it to callers would cause them
      // to persist garbage to Supabase, and all downstream tag/sub sync
      // calls against it will 400/409. Scorched-earth reset is the only
      // recovery; we fire-and-forget (it reloads the page).
      if (id.startsWith('local-')) {
        console.error('[OneSignalWeb] getPlayerId saw a corrupted "local-" ID. Triggering scorched-earth reset.', { id });
        void scorchedEarthReset(`getPlayerId returned ${id}`);
        return null;
      }
      return id;
    }
    return null;
  } catch (err) {
    console.warn('[OneSignalWeb] getPlayerId failed:', err);
    return null;
  }
}

/**
 * Poll for the Player ID for up to `timeoutMs`. Handy right after the
 * permission prompt resolves, since OneSignal's subscription handshake
 * is not synchronous with the `permission` flag flipping to true.
 */
/**
 * Event-driven resolver for the OneSignal Player / Subscription ID.
 *
 * Rationale (April 2026): the previous `setTimeout` poll loop would hang
 * forever in some browser/SDK combinations where `OneSignal.User` was
 * present but `PushSubscription.id` never populated synchronously — even
 * though the SDK *had* fired its internal `change` event. That left the
 * UI stuck in a "requesting" state. We now:
 *
 *   1. Read the ID synchronously first (fast path — already subscribed).
 *   2. Otherwise register a one-shot `change` listener and wait for it
 *      to fire with a populated ID.
 *   3. Race against a hard `timeoutMs` so the caller can always recover.
 *
 * Resolves with the ID on success. Rejects with an Error on timeout so
 * the caller's `try/catch` can unstick its UI.
 */
export async function waitForPlayerId(timeoutMs = 10_000): Promise<string> {
  const started = Date.now();

  // 1) Fast path — already subscribed.
  const existing = getPlayerId();
  if (existing) {
    console.log('[OneSignalWeb] waitForPlayerId resolved (sync)', { id: existing });
    return existing;
  }

  // Relaxed gate: the wrapper flag is advisory only. What actually matters
  // is whether `OneSignal.User.PushSubscription` is reachable — if it is,
  // we can attach the `change` listener and capture the ID, regardless of
  // what our internal bookkeeping thinks.
  if (!initialized && !sdkIsLive()) {
    throw new Error('OneSignal SDK not initialized — cannot capture Player ID');
  }

  // 2) Event-driven path — one-shot `change` listener.
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Extract the ID from whichever shape the SDK hands us. The Web SDK
    // fires events as `{ current: { id } }`; fall back to a fresh read
    // of `OneSignal.User.PushSubscription.id` for safety across versions.
    const extractId = (evt: unknown): string | null => {
      const maybe =
        (evt as { current?: { id?: string | null } } | undefined)?.current?.id ??
        getPlayerId();
      return typeof maybe === 'string' && maybe.length > 0 ? maybe : null;
    };

    const handler = (evt: unknown) => {
      const id = extractId(evt);
      if (!id || settled) return;
      settled = true;
      cleanup();
      console.log('[OneSignalWeb] waitForPlayerId resolved (event)', {
        id,
        elapsedMs: Date.now() - started,
      });
      resolve(id);
    };

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        OneSignal.User.PushSubscription.removeEventListener('change', handler);
      } catch {
        /* no-op */
      }
    };

    try {
      OneSignal.User.PushSubscription.addEventListener('change', handler);
    } catch (err) {
      console.error('[OneSignalWeb] Failed to attach change listener:', err);
      reject(err instanceof Error ? err : new Error('Failed to attach listener'));
      return;
    }

    // 3) Hard timeout — always let the caller recover its UI state.
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      let permission: boolean | string = 'unknown';
      try { permission = OneSignal.Notifications.permission; } catch { /* no-op */ }
      console.warn('[OneSignalWeb] waitForPlayerId timed out', {
        elapsedMs: Date.now() - started,
        permission,
      });
      reject(new Error(`waitForPlayerId timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Belt-and-suspenders: the SDK might populate the ID between our
    // initial sync read and the listener being attached. Re-check once
    // on the next microtask.
    queueMicrotask(() => {
      if (settled) return;
      const late = getPlayerId();
      if (late) handler({ current: { id: late } });
    });
  });
}

/**
 * Subscribe to push-subscription changes. Useful for auto-syncing the
 * Player ID to Supabase whenever the SDK updates it (e.g. after a silent
 * re-subscription following browser reset).
 *
 * Returns an unsubscribe function. Swallows errors — listener registration
 * is best-effort.
 */
export function onPlayerIdChange(cb: (id: string | null) => void): () => void {
  if (!initialized) return () => {};
  try {
    const handler = () => cb(getPlayerId());
    OneSignal.User.PushSubscription.addEventListener('change', handler);
    return () => {
      try {
        OneSignal.User.PushSubscription.removeEventListener('change', handler);
      } catch {
        /* no-op */
      }
    };
  } catch (err) {
    console.warn('[OneSignalWeb] onPlayerIdChange listener failed:', err);
    return () => {};
  }
}
