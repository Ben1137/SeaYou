/**
 * Voyage Log Service — Phase 6.
 *
 * Persists a completed navigation session as a voyage log row. Track
 * history comes straight from `offlineNavigation.getNavigationHistory()`;
 * we compute summary stats (distance, max / avg speed), wrap the path as
 * a GeoJSON `LineString` with a sibling `coordTimes` / `coordSpeeds`
 * array for time-aware replays, and upsert into `voyage_logs`.
 *
 * Cloud writes degrade gracefully:
 *   • If Supabase isn't configured or the user is anonymous, the log is
 *     cached to localStorage under `seame:voyage_logs` so it's still
 *     available in the UI.
 *   • On any Supabase error the log lives only in localStorage — we
 *     never block the end-of-voyage flow on a network write.
 */
import type { Route } from '../types/navigation';
import { calculateDistance } from './routePlanningService';
import { isSupabaseConfigured, getSupabaseClient } from './SupabaseService';

const TABLE = 'voyage_logs';
const LOCAL_KEY = 'seame:voyage_logs';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TrackPoint {
  lat: number;
  lon: number;
  timestamp: Date;
  speed: number;
}

export interface VoyageLog {
  id: string;
  userId?: string;
  routeId?: string | null;
  name?: string;
  /** GeoJSON LineString with `coordTimes` + `coordSpeeds` siblings. */
  track: GeoJsonTrack;
  startTime: Date;
  endTime: Date;
  /** Nautical miles. */
  distanceTraveled: number;
  /** Knots. */
  maxSpeed: number;
  /** Knots. */
  avgSpeed: number;
  createdAt: Date;
}

export interface GeoJsonTrack {
  type: 'Feature';
  properties: {
    name?: string;
    coordTimes: string[];
    coordSpeeds: number[];
  };
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

/** Fold a track-point series into a GeoJSON LineString. */
export function trackToGeoJson(
  points: TrackPoint[],
  name?: string,
): GeoJsonTrack {
  return {
    type: 'Feature',
    properties: {
      name,
      coordTimes: points.map((p) => new Date(p.timestamp).toISOString()),
      coordSpeeds: points.map((p) => p.speed),
    },
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.lon, p.lat] as [number, number]),
    },
  };
}

/** Walk the track summing great-circle hops. */
export function computeTrackStats(points: TrackPoint[]): {
  distanceTraveled: number;
  maxSpeed: number;
  avgSpeed: number;
  startTime: Date;
  endTime: Date;
} {
  if (points.length === 0) {
    const now = new Date();
    return {
      distanceTraveled: 0,
      maxSpeed: 0,
      avgSpeed: 0,
      startTime: now,
      endTime: now,
    };
  }
  let dist = 0;
  let max = 0;
  let speedSum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.speed > max) max = p.speed;
    speedSum += p.speed;
    if (i > 0) {
      const prev = points[i - 1];
      dist += calculateDistance(prev.lat, prev.lon, p.lat, p.lon);
    }
  }
  return {
    distanceTraveled: dist,
    maxSpeed: max,
    avgSpeed: speedSum / points.length,
    startTime: new Date(points[0].timestamp),
    endTime: new Date(points[points.length - 1].timestamp),
  };
}

async function getUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supa = getSupabaseClient();
    const { data } = await supa.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function readLocal(): VoyageLog[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VoyageLog[];
    return parsed.map((v) => ({
      ...v,
      startTime: new Date(v.startTime),
      endTime: new Date(v.endTime),
      createdAt: new Date(v.createdAt),
    }));
  } catch {
    return [];
  }
}

function writeLocal(logs: VoyageLog[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(logs));
  } catch {
    /* quota exceeded or disabled — we've done our best */
  }
}

function rowToLog(row: any): VoyageLog {
  return {
    id: row.id,
    userId: row.user_id,
    routeId: row.route_id ?? null,
    name: row.name ?? undefined,
    track: row.track_history,
    startTime: new Date(row.start_time),
    endTime: new Date(row.end_time),
    distanceTraveled: Number(row.distance_traveled ?? 0),
    maxSpeed: Number(row.max_speed ?? 0),
    avgSpeed: Number(row.avg_speed ?? 0),
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  };
}

/**
 * Build and persist a voyage log from a raw track-point series.
 * Returns the canonical row (cloud uuid when signed-in, client id
 * otherwise).
 */
export async function saveVoyageLog(
  points: TrackPoint[],
  opts: {
    route?: Route | null;
    name?: string;
  } = {},
): Promise<VoyageLog> {
  const stats = computeTrackStats(points);
  const clientId = `voyage-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;

  const log: VoyageLog = {
    id: clientId,
    routeId: opts.route?.id ?? null,
    name: opts.name ?? opts.route?.name ?? `Voyage ${stats.endTime.toLocaleString()}`,
    track: trackToGeoJson(points, opts.name ?? opts.route?.name),
    startTime: stats.startTime,
    endTime: stats.endTime,
    distanceTraveled: stats.distanceTraveled,
    maxSpeed: stats.maxSpeed,
    avgSpeed: stats.avgSpeed,
    createdAt: new Date(),
  };

  // Always mirror to localStorage first — instant, offline-safe.
  const locals = readLocal();
  locals.push(log);
  writeLocal(locals);

  const userId = await getUserId();
  if (!userId) return log;

  try {
    const supa = getSupabaseClient();
    const { data, error } = await supa
      .from(TABLE)
      .insert({
        user_id: userId,
        route_id:
          opts.route?.id && UUID_RE.test(opts.route.id) ? opts.route.id : null,
        name: log.name,
        track_history: log.track,
        start_time: log.startTime.toISOString(),
        end_time: log.endTime.toISOString(),
        distance_traveled: log.distanceTraveled,
        max_speed: log.maxSpeed,
        avg_speed: log.avgSpeed,
      })
      .select()
      .single();

    if (error || !data) {
      console.warn('[voyageLog] insert failed; local copy retained', error);
      return log;
    }

    const canonical = rowToLog(data);
    // Swap the local draft for the canonical cloud row (so id is the uuid).
    const merged = readLocal().filter((v) => v.id !== clientId);
    merged.push(canonical);
    writeLocal(merged);
    return canonical;
  } catch (err) {
    console.warn('[voyageLog] insert threw; local copy retained', err);
    return log;
  }
}

/** Fetch the user's voyage history. Cloud if signed-in, else local. */
export async function listVoyageLogs(): Promise<VoyageLog[]> {
  const userId = await getUserId();
  if (!userId) return readLocal().sort(sortByEndDesc);

  try {
    const supa = getSupabaseClient();
    const { data, error } = await supa
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('end_time', { ascending: false });
    if (error || !data) {
      console.warn('[voyageLog] list failed; returning local', error);
      return readLocal().sort(sortByEndDesc);
    }
    const rows = data.map(rowToLog);
    writeLocal(rows);
    return rows;
  } catch (err) {
    console.warn('[voyageLog] list threw; returning local', err);
    return readLocal().sort(sortByEndDesc);
  }
}

export async function deleteVoyageLog(id: string): Promise<void> {
  writeLocal(readLocal().filter((v) => v.id !== id));
  const userId = await getUserId();
  if (!userId) return;
  try {
    const supa = getSupabaseClient();
    await supa.from(TABLE).delete().eq('id', id).eq('user_id', userId);
  } catch (err) {
    console.warn('[voyageLog] delete threw', err);
  }
}

function sortByEndDesc(a: VoyageLog, b: VoyageLog) {
  return b.endTime.getTime() - a.endTime.getTime();
}
