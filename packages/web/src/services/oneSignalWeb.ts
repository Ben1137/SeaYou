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
 * Initialize the OneSignal Web SDK.
 * Call once at app startup (e.g. in App.tsx useEffect).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initOneSignalWeb(appId?: string): Promise<void> {
  if (initialized) {
    console.log('[OneSignalWeb] Already initialized, skipping');
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
  } catch (err) {
    console.error('[OneSignalWeb] Initialization failed:', err);
  }
}

/**
 * Request push notification permission from the browser.
 * Returns true if the user granted permission.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!initialized) {
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
  if (!initialized) {
    console.warn('[OneSignalWeb] Not initialized — tags will not be applied');
    return;
  }

  try {
    OneSignal.User.addTag('persona', profile.userType);
    OneSignal.User.addTag('userId', profile.id);
    OneSignal.User.addTag('minScore', String(profile.notificationThresholds.minScore));
    OneSignal.User.addTag(
      'notifyHours',
      String(profile.notificationThresholds.notifyHoursInAdvance)
    );

    // Tag favorite spots (up to 5)
    const spotTags: Record<string, string> = {};
    profile.favoriteSpots.slice(0, 5).forEach((spot, i) => {
      spotTags[`spot_${i}_lat`] = spot.lat.toFixed(4);
      spotTags[`spot_${i}_lon`] = spot.lon.toFixed(4);
      spotTags[`spot_${i}_name`] = spot.name;
    });
    OneSignal.User.addTags(spotTags);

    console.log('[OneSignalWeb] User tags registered:', profile.id, profile.userType);
  } catch (err) {
    console.error('[OneSignalWeb] Failed to set user tags:', err);
  }
}

/**
 * Check if OneSignal is initialized and permission is granted.
 */
export function isNotificationReady(): boolean {
  if (!initialized) return false;
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
  if (!initialized) return null;
  try {
    // react-onesignal v3 / OneSignal Web SDK v16+:
    //   OneSignal.User.PushSubscription.id
    // Older SDKs exposed `OneSignal.getUserId()` — not used here.
    const id = OneSignal.User?.PushSubscription?.id;
    if (typeof id === 'string' && id.length > 0) return id;
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

  if (!initialized) {
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
