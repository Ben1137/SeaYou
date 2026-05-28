/**
 * AIS Service — Phase 5.
 *
 * Thin wrapper around the aisstream.io public WebSocket feed. Subscribes
 * to a viewport bbox, emits vessel-position updates, and continuously
 * evaluates the Closest Point of Approach (CPA/TCPA) between each AIS
 * target and the user's own ship (pulled from `offlineNavigation`). When
 * a target threatens to come within the danger threshold inside the
 * time horizon, a `cpaWarning` event fires so the UI can surface an
 * alarm toast.
 *
 * The service degrades gracefully:
 *   • If `VITE_AISSTREAM_API_KEY` is not set, `connect()` is a no-op and
 *     the app behaves exactly as before. We do NOT block navigation.
 *   • If the socket drops, we auto-reconnect with exponential back-off.
 *   • All emissions use a tiny event-emitter so multiple consumers (the
 *     map layer + the HUD overlay) can share a single socket.
 */
import { offlineNavigation } from '@seame/core';
import type { NavigationState } from '@seame/core';

export interface AISTarget {
  mmsi: string;
  name?: string;
  lat: number;
  lon: number;
  /** Course Over Ground — degrees true. */
  cog: number;
  /** Speed Over Ground — knots. */
  sog: number;
  /** Vessel reported heading, when different from COG. */
  heading?: number;
  /** ms epoch of last update. */
  updatedAt: number;
  shipType?: number;
}

export interface CPAWarning {
  mmsi: string;
  name?: string;
  distanceNM: number;
  timeToCpaMin: number;
}

type Listener<T> = (payload: T) => void;

/** CPA danger threshold — warn if closing inside 0.5 NM within 12 min. */
const CPA_DISTANCE_NM = 0.5;
const CPA_HORIZON_MIN = 12;

/** How stale an AIS fix can get before we drop it from the fleet map. */
const TARGET_TTL_MS = 10 * 60 * 1000;

class AISService {
  // Keep this strictly LESS than the Edge Function's 2.0° cap so we
  // never send a request the server will immediately reject. Floating-point
  // rounding and bbox-edge inclusivity differences make 2.0 vs 2.0 a coin flip.
  private static readonly MAX_BBOX_DEG = 1.95;

  private ws: WebSocket | null = null;
  private es: EventSource | null = null;
  private apiKey: string | null = null;
  private bbox: [[number, number], [number, number]] | null = null;
  private targets = new Map<string, AISTarget>();
  private reconnectAttempts = 0;
  private receivedFirstVessel = false;
  private upstreamAvailable = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private cpaTimer: ReturnType<typeof setInterval> | null = null;
  private lastCpaAlertAt = new Map<string, number>();
  private listeners = new Map<string, Set<Listener<unknown>>>();
  private connected = false;
  private lastOwnNav: NavigationState | null = null;

  constructor() {
    // Cache own-ship state so CPA sweeps don't need a getter on the core singleton.
    offlineNavigation.on('navigationUpdate', (state: NavigationState) => {
      this.lastOwnNav = state;
    });
    offlineNavigation.on('navigationStopped', () => {
      this.lastOwnNav = null;
    });
    // Vite exposes env vars on import.meta.env; fall back to null so the
    // rest of the app can run fine without an aisstream key.
    const key =
      (typeof import.meta !== 'undefined' &&
        (import.meta as any).env?.VITE_AISSTREAM_API_KEY) ||
      null;
    this.apiKey =
      key && typeof key === 'string' && key.length > 0 ? key : null;
  }

  /**
   * Returns true when AIS tracking is available — either via the secure
   * Edge Function relay (preferred, requires VITE_SUPABASE_URL) or the
   * direct WebSocket path (dev mode, requires VITE_AISSTREAM_API_KEY).
   */
  isAvailable(): boolean {
    const supabaseUrl: string =
      (typeof import.meta !== 'undefined' &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (import.meta as any).env?.VITE_SUPABASE_URL) ||
      '';
    return this.apiKey !== null || supabaseUrl.length > 0;
  }

  on<T = unknown>(event: string, fn: Listener<T>) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as Listener<unknown>);
  }

  off<T = unknown>(event: string, fn: Listener<T>) {
    this.listeners.get(event)?.delete(fn as Listener<unknown>);
  }

  private emit<T = unknown>(event: string, payload: T) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        // Never let a listener crash take the socket down.
        // eslint-disable-next-line no-console
        console.error('[ais] listener error', err);
      }
    });
  }

  getTargets(): AISTarget[] {
    return Array.from(this.targets.values());
  }

  getUpstreamAvailable(): boolean {
    return this.upstreamAvailable;
  }

  /**
   * Start/refresh the subscription to a viewport bbox.
   * bbox is expressed as [[lat1, lon1], [lat2, lon2]] per the aisstream
   * spec — the two corners of the rectangle.
   */
  setBBox(bbox: [[number, number], [number, number]]) {
    // Guard BEFORE storing — if the viewport is too large we must not update
    // this.bbox, otherwise a later scheduleReconnect() will fire connectViaRelay()
    // with the oversized bbox and hit the server's 400 cap.
    const [[lat1, lon1], [lat2, lon2]] = bbox;
    const latSpan = Math.abs(lat1 - lat2);
    const lonSpan = Math.abs(lon1 - lon2);
    if (latSpan > AISService.MAX_BBOX_DEG || lonSpan > AISService.MAX_BBOX_DEG) {
      this.emit('zoomedOut', true);
      return;
    }
    this.bbox = bbox;
    this.emit('zoomedOut', false);

    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Direct WS path: update the active subscription in-place.
      this.sendSubscription();
    } else if (this.connected && this.es) {
      // SSE relay path: bbox is encoded in the URL — reconnect to update it.
      void this.connectViaRelay();
    } else {
      // Not connected — start fresh via relay (falls back to direct WS).
      void this.connectViaRelay();
    }
  }

  connect() {
    if (!this.apiKey) return;
    if (!this.bbox) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ais] could not open socket', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.connected = true;
      this.sendSubscription();
      if (!this.cpaTimer) {
        this.cpaTimer = setInterval(() => this.runCpaSweep(), 5000);
      }
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
        this.handleMessage(msg);
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onerror = () => {
      // onclose will fire right after — let it handle the reconnect.
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  /**
   * Connect via the Supabase Edge Function relay when the user is
   * authenticated and VITE_SUPABASE_URL is configured. The relay holds the
   * aisstream API key server-side so it never appears in the client bundle.
   *
   * Falls back to the direct WebSocket path when:
   *   - No active Supabase session (unauthenticated / offline dev).
   *   - VITE_SUPABASE_URL is not set.
   *   - VITE_AISSTREAM_API_KEY is present (direct dev mode override).
   */
  async connectViaRelay(): Promise<void> {
    if (!this.bbox) return;

    // Defensive size check — this.bbox should never be oversized thanks to the
    // setBBox guard, but scheduleReconnect() calls this directly so we double-check
    // here to guarantee we never generate a URL the server will reject with 400.
    const [[cLat1, cLon1], [cLat2, cLon2]] = this.bbox;
    if (
      Math.abs(cLat1 - cLat2) > AISService.MAX_BBOX_DEG ||
      Math.abs(cLon1 - cLon2) > AISService.MAX_BBOX_DEG
    ) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseUrl: string =
      (typeof import.meta !== 'undefined' &&
        (import.meta as any).env?.VITE_SUPABASE_URL) ||
      '';
    if (!supabaseUrl) {
      // No relay configured — fall back to direct WebSocket.
      this.connect();
      return;
    }

    let token: string | null = null;
    try {
      const { getSupabaseClient } = await import('@seame/core');
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
    } catch {
      // Core package unavailable or no session — fall back to direct.
    }

    if (!token) {
      this.connect();
      return;
    }

    // Close any existing connections before opening a new one.
    this._closeTransport();

    const [[lat1, lon1], [lat2, lon2]] = this.bbox;
    const bboxParam = `${lat1},${lon1},${lat2},${lon2}`;
    // Pass token as query param — EventSource does not support custom headers.
    const sseUrl = `${supabaseUrl}/functions/v1/ais-relay?bbox=${encodeURIComponent(bboxParam)}&authorization=${encodeURIComponent(token)}`;

    this.es = new EventSource(sseUrl);

    this.es.onopen = () => {
      this.reconnectAttempts = 0;
      this.connected = true;
      // eslint-disable-next-line no-console
      console.info('[ais] SSE connected via relay');
      if (!this.cpaTimer) {
        this.cpaTimer = setInterval(() => this.runCpaSweep(), 5000);
      }
    };

    this.es.onmessage = (ev) => {
      try {
        const v = JSON.parse(ev.data as string) as AISTarget & {
          ts?: string;
          type?: string;
          message?: string;
          code?: number;
          reason?: string;
        };
        // Structured error forwarded from the Edge Function (upstream WS closed/errored).
        // Log it prominently before scheduling a reconnect so it's visible in devtools.
        if (v.type === 'error') {
          // eslint-disable-next-line no-console
          console.error(
            `[ais] upstream error from relay — message="${v.message ?? 'unknown'}"` +
            ` | code=${v.code ?? 'n/a'}` +
            ` | reason="${v.reason ?? ''}"` +
            ` — scheduling reconnect`,
          );
          // Close the EventSource so our own scheduleReconnect controls retry timing
          // instead of the browser's built-in auto-reconnect (which backs off to 3 s).
          if (this.es) { this.es.close(); this.es = null; }
          this.connected = false;
          this.scheduleReconnect();
          return;
        }
        if (!v.mmsi || typeof v.lat !== 'number' || typeof v.lon !== 'number') {
          return;
        }
        const existing = this.targets.get(v.mmsi);
        this.targets.set(v.mmsi, {
          mmsi: v.mmsi,
          name: v.name ?? existing?.name,
          lat: v.lat,
          lon: v.lon,
          cog: v.cog ?? existing?.cog ?? 0,
          sog: v.sog ?? existing?.sog ?? 0,
          heading: v.heading ?? existing?.heading,
          updatedAt: Date.now(),
          shipType: existing?.shipType,
        });
        this.gcStale();
        if (!this.receivedFirstVessel) {
          this.receivedFirstVessel = true;
          this.reconnectAttempts = 0; // Pipeline is healthy — reset backoff.
          // eslint-disable-next-line no-console
          console.info(`[ais] first vessel received: ${v.mmsi} at [${v.lat.toFixed(4)},${v.lon.toFixed(4)}]`);
        }
        this.emit('targets', this.getTargets());
        this.evaluateCPA();
      } catch {
        // ignore malformed frames
      }
    };

    // Server signals an unrecoverable upstream failure (e.g. AISStream cert
    // expired or host unreachable). Stop reconnecting immediately and surface
    // the status to the UI via 'upstreamStatus' event.
    this.es.addEventListener('upstream_error', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { message: string };
        // eslint-disable-next-line no-console
        console.warn(`[ais] upstream unavailable: ${data.message}`);
        this.upstreamAvailable = false;
        this.emit('upstreamStatus', { available: false, message: data.message });
        if (this.es) { this.es.close(); this.es = null; }
        // Cancel any pending reconnect and schedule a single slow retry in 15 min
        // so we auto-recover when AISStream fixes their side.
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.upstreamAvailable = true;
          this.emit('upstreamStatus', { available: true });
          void this.connectViaRelay();
        }, 15 * 60 * 1000);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[ais] failed to parse upstream_error event', err);
      }
    });

    this.es.onerror = (ev) => {
      // Close immediately to suppress browser's native EventSource auto-reconnect.
      if (this.es) { this.es.close(); this.es = null; }
      const wasConnected = this.connected;
      this.connected = false;
      // Only log on the FIRST failure of a chain (reconnectAttempts === 0),
      // not on every retry — prevents console spam during backoff cycles.
      if (this.reconnectAttempts === 0) {
        if (wasConnected) {
          // eslint-disable-next-line no-console
          console.warn('[ais] SSE error after successful connect — scheduling reconnect', ev);
        } else {
          // eslint-disable-next-line no-console
          console.warn('[ais] SSE connect failed — scheduling retry');
        }
      }
      this.scheduleReconnect();
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.cpaTimer) {
      clearInterval(this.cpaTimer);
      this.cpaTimer = null;
    }
    this._closeTransport();
    this.connected = false;
    this.targets.clear();
  }

  /** Close whichever transport is open without clearing reconnect state. */
  private _closeTransport() {
    if (this.es) {
      try { this.es.close(); } catch { /* noop */ }
      this.es = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* noop */ }
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (!this.bbox) return;
    if (this.reconnectTimer) return;

    // Hard cap: after 5 consecutive failures, sleep for 5 minutes before
    // trying again. Prevents runaway console spam when upstream is broken.
    const MAX_ATTEMPTS_BEFORE_COOLDOWN = 5;
    const COOLDOWN_MS = 5 * 60 * 1000;

    let delay: number;
    if (this.reconnectAttempts >= MAX_ATTEMPTS_BEFORE_COOLDOWN) {
      delay = COOLDOWN_MS;
      if (this.reconnectAttempts === MAX_ATTEMPTS_BEFORE_COOLDOWN) {
        // eslint-disable-next-line no-console
        console.warn(
          `[ais] ${MAX_ATTEMPTS_BEFORE_COOLDOWN} consecutive reconnect failures — backing off for 5 minutes`,
        );
      }
    } else {
      // Floor at 2s so AISStream has time to fully release the previous
      // upstream WS before we knock again (their free tier caps at 1).
      delay = Math.min(30000, Math.max(2000, 1000 * 2 ** this.reconnectAttempts));
    }

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // After cooldown, reset counter so we get a fresh exponential ramp
      // instead of being stuck at MAX_ATTEMPTS forever.
      if (this.reconnectAttempts > MAX_ATTEMPTS_BEFORE_COOLDOWN) {
        this.reconnectAttempts = 0;
      }
      void this.connectViaRelay();
    }, delay);
  }

  /**
   * Trigger a CPA evaluation immediately — called after each relay update
   * so warnings fire in real time instead of waiting for the 5 s sweep.
   */
  private evaluateCPA() {
    this.runCpaSweep();
  }

  private sendSubscription() {
    if (!this.ws || !this.apiKey || !this.bbox) return;
    const sub = {
      APIKey: this.apiKey,
      BoundingBoxes: [this.bbox],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    };
    try {
      this.ws.send(JSON.stringify(sub));
    } catch {
      /* noop */
    }
  }

  private handleMessage(msg: Record<string, unknown>) {
    const metadata = (msg?.MetaData ?? msg?.Metadata) as
      | Record<string, unknown>
      | undefined;
    const type = msg?.MessageType;
    if (!metadata || !type) return;
    const mmsi = String(metadata.MMSI ?? metadata.mmsi ?? '');
    if (!mmsi) return;

    const message = msg.Message as Record<string, unknown> | undefined;

    if (type === 'PositionReport') {
      const report = message?.PositionReport as
        | Record<string, unknown>
        | undefined;
      if (!report) return;
      const lat = report.Latitude;
      const lon = report.Longitude;
      if (typeof lat !== 'number' || typeof lon !== 'number') return;
      const existing = this.targets.get(mmsi);
      const next: AISTarget = {
        mmsi,
        name:
          existing?.name ??
          (typeof metadata.ShipName === 'string'
            ? metadata.ShipName.trim()
            : undefined),
        lat,
        lon,
        cog:
          typeof report.Cog === 'number' ? report.Cog : existing?.cog ?? 0,
        sog:
          typeof report.Sog === 'number' ? report.Sog : existing?.sog ?? 0,
        heading:
          typeof report.TrueHeading === 'number' &&
          report.TrueHeading !== 511
            ? report.TrueHeading
            : existing?.heading,
        updatedAt: Date.now(),
        shipType: existing?.shipType,
      };
      this.targets.set(mmsi, next);
      this.gcStale();
      this.emit('targets', this.getTargets());
    } else if (type === 'ShipStaticData') {
      const stat = message?.ShipStaticData as
        | Record<string, unknown>
        | undefined;
      if (!stat) return;
      const existing = this.targets.get(mmsi);
      if (!existing) return;
      const statName = typeof stat.Name === 'string' ? stat.Name : '';
      existing.name = statName.trim() || existing.name;
      existing.shipType =
        typeof stat.Type === 'number' ? stat.Type : existing.shipType;
    }
  }

  private gcStale() {
    const now = Date.now();
    let removed = false;
    for (const [k, v] of this.targets) {
      if (now - v.updatedAt > TARGET_TTL_MS) {
        this.targets.delete(k);
        removed = true;
      }
    }
    if (removed) this.emit('targets', this.getTargets());
  }

  /**
   * Compute CPA/TCPA between own-ship and every live target. Emits
   * `cpaWarning` with the worst offender (closest / soonest) when the
   * configured threshold is breached. Throttled per-MMSI at 60s so we
   * don't spam the UI.
   */
  private runCpaSweep() {
    const ownNav = this.lastOwnNav;
    const own = ownNav?.currentPosition;
    if (!own) return;
    const ownSog = ownNav?.speed ?? 0;
    const ownCog = ownNav?.heading ?? 0;
    if (ownSog < 0.1) return; // anchored — CPA noise, skip.

    let worst: { target: AISTarget; cpa: number; tcpa: number } | null = null;
    for (const t of this.targets.values()) {
      const result = computeCPA(
        { lat: own.lat, lon: own.lon, cog: ownCog, sog: ownSog },
        { lat: t.lat, lon: t.lon, cog: t.cog, sog: t.sog },
      );
      if (!result) continue;
      if (result.tcpa < 0 || result.tcpa > CPA_HORIZON_MIN) continue;
      if (result.cpa > CPA_DISTANCE_NM) continue;
      if (!worst || result.cpa < worst.cpa) {
        worst = { target: t, cpa: result.cpa, tcpa: result.tcpa };
      }
    }

    if (worst) {
      const last = this.lastCpaAlertAt.get(worst.target.mmsi) ?? 0;
      if (Date.now() - last > 60000) {
        this.lastCpaAlertAt.set(worst.target.mmsi, Date.now());
        const warning: CPAWarning = {
          mmsi: worst.target.mmsi,
          name: worst.target.name,
          distanceNM: worst.cpa,
          timeToCpaMin: worst.tcpa,
        };
        this.emit('cpaWarning', warning);
      }
    }
  }
}

/**
 * Compute CPA (NM) and TCPA (minutes) between two moving points on a
 * local tangent plane. Good enough for the < 20 NM ranges AIS collision
 * avoidance cares about. Returns null if the relative velocity is
 * effectively zero (parallel tracks at identical speed).
 */
function computeCPA(
  a: { lat: number; lon: number; cog: number; sog: number },
  b: { lat: number; lon: number; cog: number; sog: number },
): { cpa: number; tcpa: number } | null {
  // Convert lat/lon offset to NM using local meridian/parallel scaling.
  const latMidRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const NM_PER_DEG_LAT = 60;
  const NM_PER_DEG_LON = 60 * Math.cos(latMidRad);
  const rx = (b.lon - a.lon) * NM_PER_DEG_LON;
  const ry = (b.lat - a.lat) * NM_PER_DEG_LAT;

  // Convert course+speed (meteorological: 0=N, clockwise) to velocity.
  const ax = a.sog * Math.sin((a.cog * Math.PI) / 180);
  const ay = a.sog * Math.cos((a.cog * Math.PI) / 180);
  const bx = b.sog * Math.sin((b.cog * Math.PI) / 180);
  const by = b.sog * Math.cos((b.cog * Math.PI) / 180);

  // Relative velocity of B w.r.t. A.
  const vx = bx - ax;
  const vy = by - ay;
  const v2 = vx * vx + vy * vy;
  if (v2 < 1e-6) {
    // Parallel, constant range.
    const dist = Math.hypot(rx, ry);
    return { cpa: dist, tcpa: 0 };
  }

  // Minimize |r + v * t|² w.r.t. t.
  const tHours = -(rx * vx + ry * vy) / v2;
  const tcpa = Math.max(0, tHours) * 60;
  const cx = rx + vx * tHours;
  const cy = ry + vy * tHours;
  const cpa = Math.hypot(cx, cy);
  return { cpa, tcpa };
}

export const aisService = new AISService();
