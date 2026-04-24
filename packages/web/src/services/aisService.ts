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
  private ws: WebSocket | null = null;
  private apiKey: string | null = null;
  private bbox: [[number, number], [number, number]] | null = null;
  private targets = new Map<string, AISTarget>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private cpaTimer: ReturnType<typeof setInterval> | null = null;
  private lastCpaAlertAt = new Map<string, number>();
  private listeners = new Map<string, Set<Listener<any>>>();
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

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  on<T = any>(event: string, fn: Listener<T>) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off<T = any>(event: string, fn: Listener<T>) {
    this.listeners.get(event)?.delete(fn);
  }

  private emit<T = any>(event: string, payload: T) {
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

  /**
   * Start/refresh the subscription to a viewport bbox.
   * bbox is expressed as [[lat1, lon1], [lat2, lon2]] per the aisstream
   * spec — the two corners of the rectangle.
   */
  setBBox(bbox: [[number, number], [number, number]]) {
    this.bbox = bbox;
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscription();
    } else {
      this.connect();
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
        const msg = JSON.parse(ev.data as string);
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

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.cpaTimer) {
      clearInterval(this.cpaTimer);
      this.cpaTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    this.connected = false;
    this.targets.clear();
  }

  private scheduleReconnect() {
    if (!this.apiKey || !this.bbox) return;
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
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

  private handleMessage(msg: any) {
    const metadata = msg?.MetaData ?? msg?.Metadata;
    const type = msg?.MessageType;
    if (!metadata || !type) return;
    const mmsi = String(metadata.MMSI ?? metadata.mmsi ?? '');
    if (!mmsi) return;

    if (type === 'PositionReport') {
      const report = msg.Message?.PositionReport;
      if (!report) return;
      const lat = report.Latitude;
      const lon = report.Longitude;
      if (typeof lat !== 'number' || typeof lon !== 'number') return;
      const existing = this.targets.get(mmsi);
      const next: AISTarget = {
        mmsi,
        name: existing?.name ?? metadata.ShipName?.trim() ?? undefined,
        lat,
        lon,
        cog:
          typeof report.Cog === 'number'
            ? report.Cog
            : existing?.cog ?? 0,
        sog:
          typeof report.Sog === 'number'
            ? report.Sog
            : existing?.sog ?? 0,
        heading:
          typeof report.TrueHeading === 'number' && report.TrueHeading !== 511
            ? report.TrueHeading
            : existing?.heading,
        updatedAt: Date.now(),
        shipType: existing?.shipType,
      };
      this.targets.set(mmsi, next);
      this.gcStale();
      this.emit('targets', this.getTargets());
    } else if (type === 'ShipStaticData') {
      const stat = msg.Message?.ShipStaticData;
      if (!stat) return;
      const existing = this.targets.get(mmsi);
      if (!existing) return;
      existing.name = (stat.Name ?? existing.name ?? '').trim() || existing.name;
      existing.shipType = stat.Type ?? existing.shipType;
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
