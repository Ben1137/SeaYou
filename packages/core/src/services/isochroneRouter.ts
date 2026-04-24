/**
 * Isochrone Router — Phase 3 of the Route Planner roadmap.
 *
 * Pragmatic ship-first implementation of environment-aware routing.
 * The literal "isochrone expansion" algorithm (advance the reachable
 * polygon by Δt, cut it against land, repeat) is the gold standard for
 * yacht routing but is overkill for our first pass.
 *
 * Instead we:
 *   1. Build a uniform lat/lon lattice covering the padded bbox of
 *      start → destination.
 *   2. Sample Open-Meteo wind + current + wave ONCE for the whole grid.
 *   3. A*-search the lattice (8-connected neighbours). Edge cost = time
 *      to traverse that edge at the **Speed Over Ground** derived from:
 *        - boat polar (cruiseSpeed, upwindPenalty)
 *        - true wind angle relative to leg bearing
 *        - ocean current vector projected onto leg bearing
 *        - head-sea soft penalty when wave_height > maxHeadSea
 *      Landmask crossings and shallow cells are blocked outright.
 *   4. The returned polyline is the optimized path. The caller can feed
 *      it into `RouteContext.setRoute(...)` to replace the straight line.
 *
 * The grid stays small (default 12×12 = 144 nodes) so that the whole
 * Open-Meteo fetch fits inside the bulk-coordinate URL budget enforced
 * by `marineGridService.ts`. Users routing across oceans will still get
 * a useful path — it will simply follow the rhumb line closely.
 *
 * This file depends on nothing in the web package: stays in
 * `@seame/core` so that mobile and watch can call it later.
 */

import type { FeatureCollection } from 'geojson';
import { lineString } from '@turf/helpers';
import lineIntersect from '@turf/line-intersect';
import { haversineNM, sampleWeatherAlongRoute, analyzeRouteSafety } from './routeSafetyService';
import type { Waypoint, Route } from '../types/navigation';
import { API_ENDPOINTS, WEATHER_CONSTANTS } from '../constants';
import { deduplicatedFetch } from '../utils/requestDeduplication';
import { globalRateLimiter } from './apiRateLimiter';

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export interface VesselPolar {
  cruiseSpeed: number;     // knots, still-water
  upwindPenalty: number;   // 0..1 — fraction of cruiseSpeed lost upwind
  maxHeadSea: number;      // meters — above this head seas cost extra
  isSailboat?: boolean;    // true = apply upwind penalty (no engine)
}

export interface OptimizeOptions {
  gridSize?: number;       // nodes per side (default 12)
  bboxPadDeg?: number;     // lat/lon padding around endpoints (default 0.3)
  coastline?: FeatureCollection | null;
  departureTime?: Date;
  maxCells?: number;       // hard ceiling on grid size (default 200)
}

export interface OptimizedRoute {
  waypoints: Waypoint[];
  etaHours: number;
  distanceNM: number;
  /** Naive rhumb-line ETA for the same endpoints — for comparison. */
  rhumbEtaHours: number;
  /** True when the router fell back to rhumb (no weather data available). */
  fellBackToRhumb: boolean;
  diagnostics: {
    gridSize: number;
    cellsVisited: number;
    blockedCells: number;
  };
}

export interface DepartureWindowScore {
  departureTime: Date;
  etaHours: number;
  distanceNM: number;
  /** Sum of per-segment severity weights — lower is better. */
  safetyScore: number;
  /** Composite rank score — lower is better. Equal weight time / safety. */
  rank: number;
  summary: string;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const KNOTS_TO_KMH = 1.852;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

function bearingDeg(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.cos(dLon);
  const br = Math.atan2(y, x);
  return ((br * 180) / Math.PI + 360) % 360;
}

/** Smallest unsigned angular distance (0..180) between two bearings. */
function angleDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Open-Meteo returns wind/current direction as "FROM" — convert to UV. */
function dirSpeedToUV(speed: number, dirFromDeg: number): [number, number] {
  // Meteorological convention: wind from 0° blows to the south → v = -speed.
  const rad = toRad(dirFromDeg);
  const u = -speed * Math.sin(rad);
  const v = -speed * Math.cos(rad);
  return [u, v];
}

/** Project an (u,v) m/s vector onto a compass bearing. Positive = helping. */
function projectOnBearing(u: number, v: number, bearing: number): number {
  const rad = toRad(bearing);
  const bx = Math.sin(rad);
  const by = Math.cos(rad);
  return u * bx + v * by;
}

// ─────────────────────────────────────────────────────────────────
// Grid weather sampling
// ─────────────────────────────────────────────────────────────────

interface GridCell {
  i: number;
  j: number;
  lat: number;
  lon: number;
  /** m/s — wind at this cell at departure hour. */
  windU: number | null;
  windV: number | null;
  /** m/s — ocean current. */
  currentU: number | null;
  currentV: number | null;
  /** meters */
  waveHeight: number | null;
  /** True when the cell is unsafe (land intersect, etc.). */
  blocked: boolean;
}

async function fetchGridWeather(
  cells: GridCell[],
  departureTime: Date,
): Promise<void> {
  if (cells.length === 0) return;

  // Split into chunks of 100 coords to respect URL budgets.
  const chunkSize = 100;
  for (let start = 0; start < cells.length; start += chunkSize) {
    const chunk = cells.slice(start, start + chunkSize);
    const lats = chunk.map((c) => c.lat.toFixed(4)).join(',');
    const lngs = chunk.map((c) => c.lon.toFixed(4)).join(',');
    const forecastDays = 2;

    const marineParams = new URLSearchParams({
      latitude: lats,
      longitude: lngs,
      hourly:
        'wave_height,ocean_current_velocity,ocean_current_direction',
      timezone: 'UTC',
      forecast_days: String(forecastDays),
      cell_selection: WEATHER_CONSTANTS.MARINE_CELL_SELECTION,
    });
    const forecastParams = new URLSearchParams({
      latitude: lats,
      longitude: lngs,
      hourly: 'wind_speed_10m,wind_direction_10m',
      timezone: 'UTC',
      wind_speed_unit: 'ms',
      forecast_days: String(forecastDays),
    });

    let marineResp: any;
    let forecastResp: any;
    try {
      marineResp = await globalRateLimiter.enqueue(() =>
        deduplicatedFetch<any>(
          `${API_ENDPOINTS.MARINE}?${marineParams.toString()}`,
          undefined,
          { ttl: 300000 },
        ),
      );
      forecastResp = await globalRateLimiter.enqueue(() =>
        deduplicatedFetch<any>(
          `${API_ENDPOINTS.FORECAST}?${forecastParams.toString()}`,
          undefined,
          { ttl: 300000 },
        ),
      );
    } catch (e) {
      console.warn('[isochroneRouter] grid weather fetch failed', e);
      // Leave null fields in place; caller will fall back to rhumb.
      continue;
    }

    const marineArr = Array.isArray(marineResp) ? marineResp : [marineResp];
    const forecastArr = Array.isArray(forecastResp)
      ? forecastResp
      : [forecastResp];

    const target = departureTime.getTime();
    chunk.forEach((cell, idx) => {
      const m = marineArr[idx] ?? {};
      const f = forecastArr[idx] ?? {};
      const mTimes: string[] | undefined = m.hourly?.time;
      const fTimes: string[] | undefined = f.hourly?.time;
      const mIdx = pickHourIndex(mTimes, target);
      const fIdx = pickHourIndex(fTimes, target);

      const waveH: number | null =
        mIdx >= 0 ? m.hourly?.wave_height?.[mIdx] ?? null : null;
      const curSpd: number | null =
        mIdx >= 0 ? m.hourly?.ocean_current_velocity?.[mIdx] ?? null : null;
      const curDir: number | null =
        mIdx >= 0 ? m.hourly?.ocean_current_direction?.[mIdx] ?? null : null;
      const windSpd: number | null =
        fIdx >= 0 ? f.hourly?.wind_speed_10m?.[fIdx] ?? null : null;
      const windDir: number | null =
        fIdx >= 0 ? f.hourly?.wind_direction_10m?.[fIdx] ?? null : null;

      if (windSpd !== null && windDir !== null) {
        const [wu, wv] = dirSpeedToUV(windSpd, windDir);
        cell.windU = wu;
        cell.windV = wv;
      }
      if (curSpd !== null && curDir !== null) {
        const [cu, cv] = dirSpeedToUV(curSpd, curDir);
        cell.currentU = cu;
        cell.currentV = cv;
      }
      cell.waveHeight = waveH;
    });
  }
}

function pickHourIndex(
  times: string[] | undefined,
  targetMs: number,
): number {
  if (!times || times.length === 0) return -1;
  let bestIdx = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i] + 'Z');
    if (Number.isNaN(t)) continue;
    const d = Math.abs(t - targetMs);
    if (d < bestDelta) {
      bestDelta = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ─────────────────────────────────────────────────────────────────
// Landmask flagging per cell
// ─────────────────────────────────────────────────────────────────

/**
 * Mark a cell as blocked when it sits on the coastline. Cheap heuristic:
 * draw a tiny cross around the cell and intersect against the coastline
 * FeatureCollection. Any hit → cell is coastal/land and unsafe.
 */
function flagCoastalCells(
  cells: GridCell[],
  coastline: FeatureCollection | null | undefined,
  cellSpacingDeg: number,
): void {
  if (!coastline || !coastline.features?.length) return;
  for (const c of cells) {
    const eps = cellSpacingDeg / 2;
    const cross = lineString([
      [c.lon - eps, c.lat],
      [c.lon + eps, c.lat],
    ]);
    const vert = lineString([
      [c.lon, c.lat - eps],
      [c.lon, c.lat + eps],
    ]);
    if (
      lineIntersect(cross, coastline as FeatureCollection<any>).features
        .length > 0 ||
      lineIntersect(vert, coastline as FeatureCollection<any>).features
        .length > 0
    ) {
      c.blocked = true;
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// SOG model
// ─────────────────────────────────────────────────────────────────

/**
 * Effective Speed Over Ground (knots) from cell `a` to cell `b`, given
 * the wind/current/wave environment at cell `a`. Returns 0 for blocked
 * cells — infinite cost in the pathfinder.
 *
 * Model (simple but defensible):
 *   1. Boat speed = cruiseSpeed.
 *   2. If sailboat and TWA < 45°, multiply by (1 - upwindPenalty).
 *   3. Add (current projected onto bearing × knots conversion).
 *   4. Subtract a small penalty when pointing into heavy head sea.
 */
function sogBetween(
  a: GridCell,
  b: GridCell,
  polar: VesselPolar,
): { sogKts: number; timeHours: number; distanceNM: number } {
  const dist = haversineNM(a, { lat: b.lat, lon: b.lon });
  if (dist === 0) return { sogKts: 0, timeHours: 0, distanceNM: 0 };
  const bearing = bearingDeg(a, { lat: b.lat, lon: b.lon });

  let speedKts = polar.cruiseSpeed;

  // Sail/wind effects
  if (polar.isSailboat && a.windU !== null && a.windV !== null) {
    const windMs = Math.hypot(a.windU, a.windV);
    if (windMs > 0.5) {
      // Wind bearing (TO direction) — opposite of its FROM representation.
      const windBearingTo = (Math.atan2(a.windU, a.windV) * 180) / Math.PI;
      const twa = angleDelta(((windBearingTo + 180) % 360 + 360) % 360, bearing);
      if (twa < 45) {
        speedKts *= 1 - polar.upwindPenalty;
      } else if (twa > 160) {
        // Dead downwind — slight loss too for sailboats.
        speedKts *= 0.9;
      }
    }
  }

  // Current assist / penalty
  if (a.currentU !== null && a.currentV !== null) {
    const alongCurrentMs = projectOnBearing(
      a.currentU,
      a.currentV,
      bearing,
    );
    // Convert m/s contribution into knots (1 m/s ≈ 1.944 kn).
    speedKts += alongCurrentMs * 1.9438;
  }

  // Head-sea comfort penalty
  if (a.waveHeight !== null && a.waveHeight > polar.maxHeadSea) {
    const factor = Math.max(
      0.4,
      1 - (a.waveHeight - polar.maxHeadSea) * 0.15,
    );
    speedKts *= factor;
  }

  speedKts = Math.max(0.5, speedKts); // floor — never fully stall
  return {
    sogKts: speedKts,
    timeHours: dist / speedKts,
    distanceNM: dist,
  };
}

// ─────────────────────────────────────────────────────────────────
// Grid construction + A*
// ─────────────────────────────────────────────────────────────────

function buildGrid(
  start: { lat: number; lon: number },
  dest: { lat: number; lon: number },
  size: number,
  pad: number,
): { cells: GridCell[]; size: number; cellSpacingDeg: number } {
  const north = Math.max(start.lat, dest.lat) + pad;
  const south = Math.min(start.lat, dest.lat) - pad;
  const east = Math.max(start.lon, dest.lon) + pad;
  const west = Math.min(start.lon, dest.lon) - pad;
  const cells: GridCell[] = [];
  for (let j = 0; j < size; j++) {
    const lat = south + ((north - south) * j) / (size - 1);
    for (let i = 0; i < size; i++) {
      const lon = west + ((east - west) * i) / (size - 1);
      cells.push({
        i,
        j,
        lat,
        lon,
        windU: null,
        windV: null,
        currentU: null,
        currentV: null,
        waveHeight: null,
        blocked: false,
      });
    }
  }
  const cellSpacingDeg = (north - south) / Math.max(1, size - 1);
  return { cells, size, cellSpacingDeg };
}

function cellIndex(i: number, j: number, size: number): number {
  return j * size + i;
}

function nearestCell(
  cells: GridCell[],
  size: number,
  p: { lat: number; lon: number },
): number {
  let bestIdx = 0;
  let best = Infinity;
  for (let idx = 0; idx < cells.length; idx++) {
    const c = cells[idx];
    const d = (c.lat - p.lat) ** 2 + (c.lon - p.lon) ** 2;
    if (d < best) {
      best = d;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

/**
 * Binary-heap-free A*. Grids stay small (N ≤ 200) so linear scan for the
 * open-set min is fine and keeps the dependency footprint zero.
 */
function aStar(
  cells: GridCell[],
  size: number,
  startIdx: number,
  goalIdx: number,
  polar: VesselPolar,
): { path: number[]; totalHours: number; cellsVisited: number } | null {
  const N = cells.length;
  const gScore = new Float64Array(N).fill(Infinity) as unknown as Float64Array;
  const fScore = new Float64Array(N).fill(Infinity) as unknown as Float64Array;
  for (let k = 0; k < N; k++) {
    gScore[k] = Infinity;
    fScore[k] = Infinity;
  }
  const cameFrom = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = new Set<number>();

  gScore[startIdx] = 0;
  fScore[startIdx] = haversineNM(cells[startIdx], cells[goalIdx]);
  open.add(startIdx);

  const neighbors = (idx: number): number[] => {
    const c = cells[idx];
    const out: number[] = [];
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue;
        const ni = c.i + di;
        const nj = c.j + dj;
        if (ni < 0 || ni >= size || nj < 0 || nj >= size) continue;
        out.push(cellIndex(ni, nj, size));
      }
    }
    return out;
  };

  let cellsVisited = 0;
  while (open.size > 0) {
    // Find open cell with min fScore.
    let current = -1;
    let bestF = Infinity;
    for (const idx of open) {
      if (fScore[idx] < bestF) {
        bestF = fScore[idx];
        current = idx;
      }
    }
    if (current === -1) break;
    cellsVisited++;

    if (current === goalIdx) {
      // Reconstruct path.
      const path: number[] = [current];
      while (cameFrom[current] !== -1) {
        current = cameFrom[current];
        path.unshift(current);
      }
      return { path, totalHours: gScore[goalIdx], cellsVisited };
    }

    open.delete(current);
    closed[current] = 1;

    for (const nIdx of neighbors(current)) {
      if (closed[nIdx]) continue;
      const nb = cells[nIdx];
      if (nb.blocked) continue;

      const { timeHours } = sogBetween(cells[current], nb, polar);
      const tentativeG = gScore[current] + timeHours;
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentativeG;
        // Heuristic: best-case time at cruise speed.
        fScore[nIdx] =
          tentativeG +
          haversineNM(nb, cells[goalIdx]) / Math.max(1, polar.cruiseSpeed);
        open.add(nIdx);
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────
// Public: optimize()
// ─────────────────────────────────────────────────────────────────

/**
 * Run the full isochrone pipeline: grid build → weather fetch →
 * landmask → A*. Falls back to the rhumb line if the grid can't be
 * sampled (offline, API failure, etc.).
 */
export async function optimizeRoute(
  start: Waypoint,
  destination: Waypoint,
  polar: VesselPolar,
  options: OptimizeOptions = {},
): Promise<OptimizedRoute> {
  const gridSize = Math.min(
    options.gridSize ?? 12,
    Math.floor(Math.sqrt(options.maxCells ?? 200)),
  );
  const pad = options.bboxPadDeg ?? 0.3;
  const departureTime = options.departureTime ?? new Date();

  const rhumbDistNM = haversineNM(start, destination);
  const rhumbEtaHours = rhumbDistNM / Math.max(1, polar.cruiseSpeed);

  const fallback = (): OptimizedRoute => ({
    waypoints: [start, destination],
    etaHours: rhumbEtaHours,
    distanceNM: rhumbDistNM,
    rhumbEtaHours,
    fellBackToRhumb: true,
    diagnostics: { gridSize, cellsVisited: 0, blockedCells: 0 },
  });

  try {
    const { cells, size, cellSpacingDeg } = buildGrid(
      start,
      destination,
      gridSize,
      pad,
    );
    await fetchGridWeather(cells, departureTime);
    flagCoastalCells(cells, options.coastline, cellSpacingDeg);

    // Make sure start + goal cells are not mistakenly blocked.
    const startIdx = nearestCell(cells, size, start);
    const goalIdx = nearestCell(cells, size, destination);
    cells[startIdx].blocked = false;
    cells[goalIdx].blocked = false;
    // Pin actual endpoints so the path starts/ends exactly where the user asked.
    cells[startIdx].lat = start.lat;
    cells[startIdx].lon = start.lon;
    cells[goalIdx].lat = destination.lat;
    cells[goalIdx].lon = destination.lon;

    const blockedCells = cells.reduce(
      (n, c) => (c.blocked ? n + 1 : n),
      0,
    );

    const result = aStar(cells, size, startIdx, goalIdx, polar);
    if (!result) return fallback();

    const waypoints: Waypoint[] = result.path.map((idx, k) => {
      const c = cells[idx];
      if (k === 0) return { ...start };
      if (k === result.path.length - 1) return { ...destination };
      return {
        id: `opt-${k}-${Date.now()}`,
        lat: c.lat,
        lon: c.lon,
        name: '',
        type: 'waypoint',
      };
    });

    // Measure the optimized polyline distance directly so callers can
    // compare apples-to-apples with the rhumb.
    let distanceNM = 0;
    for (let k = 0; k < waypoints.length - 1; k++) {
      distanceNM += haversineNM(waypoints[k], waypoints[k + 1]);
    }

    return {
      waypoints,
      etaHours: result.totalHours,
      distanceNM,
      rhumbEtaHours,
      fellBackToRhumb: false,
      diagnostics: {
        gridSize: size,
        cellsVisited: result.cellsVisited,
        blockedCells,
      },
    };
  } catch (e) {
    console.warn('[isochroneRouter] optimize failed, falling back', e);
    return fallback();
  }
}

// ─────────────────────────────────────────────────────────────────
// Public: departure window recommender
// ─────────────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<string, number> = {
  safe: 0,
  caution: 1,
  danger: 4,
};

/**
 * Score a specific departure time by running the weather sampler at
 * that time and summing per-segment severity weights. Cheaper than a
 * full optimize pass — use this to pick the Top-N departure windows.
 */
async function scoreDeparture(
  waypoints: Waypoint[],
  averageSpeedKnots: number,
  departureTime: Date,
  persona: import('../types/preferences').OnboardingPersona | null | undefined,
): Promise<DepartureWindowScore> {
  const safety = await analyzeRouteSafety(
    waypoints,
    averageSpeedKnots,
    { persona, departureTime, skipDepth: true, coastline: null },
  );
  const safetyScore = safety.segments.reduce(
    (acc, s) => acc + (SEVERITY_WEIGHT[s.severity] ?? 0),
    0,
  );
  // Distance is fixed across departure times for the same route.
  let distanceNM = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    distanceNM += haversineNM(waypoints[i], waypoints[i + 1]);
  }
  const etaHours = distanceNM / Math.max(1, averageSpeedKnots);
  // Rank: equal weight safety vs. time-to-destination.
  const rank = safetyScore * 1.0 + etaHours * 0.05;
  const severityCounts = safety.segments.reduce(
    (acc, s) => {
      acc[s.severity]++;
      return acc;
    },
    { safe: 0, caution: 0, danger: 0 } as Record<string, number>,
  );
  const summary =
    severityCounts.danger > 0
      ? `${severityCounts.danger} danger segment${severityCounts.danger > 1 ? 's' : ''}`
      : severityCounts.caution > 0
        ? `${severityCounts.caution} caution segment${severityCounts.caution > 1 ? 's' : ''}`
        : 'All-clear forecast';
  return {
    departureTime,
    etaHours,
    distanceNM,
    safetyScore,
    rank,
    summary,
  };
}

/**
 * Evaluate several candidate departure times over the next `horizonH`
 * hours (default 48), returning them sorted by composite rank (lowest =
 * best). `stepHours` default 3h → 16 evaluations over 48h.
 */
export async function recommendDepartureWindows(
  waypoints: Waypoint[],
  averageSpeedKnots: number,
  options: {
    horizonH?: number;
    stepHours?: number;
    persona?: import('../types/preferences').OnboardingPersona | null;
    now?: Date;
    topN?: number;
  } = {},
): Promise<DepartureWindowScore[]> {
  const horizon = options.horizonH ?? 48;
  const step = options.stepHours ?? 3;
  const now = options.now ?? new Date();
  const topN = options.topN ?? 3;

  const scores: DepartureWindowScore[] = [];
  for (let h = 0; h <= horizon; h += step) {
    const dt = new Date(now.getTime() + h * 3600 * 1000);
    try {
      const score = await scoreDeparture(
        waypoints,
        averageSpeedKnots,
        dt,
        options.persona,
      );
      scores.push(score);
    } catch (e) {
      console.warn('[isochroneRouter] scoreDeparture failed for', dt, e);
    }
  }
  scores.sort((a, b) => a.rank - b.rank);
  return scores.slice(0, topN);
}

// Silence tree-shaking warnings for unused imports that are part of the
// public turf API surface.
export const __turfBundleIso = { lineString, lineIntersect };
export const __weatherBundle = { sampleWeatherAlongRoute };
export const __knotsToKmh = KNOTS_TO_KMH;

// Route helper — turn optimize output back into a full Route object.
export function buildOptimizedRoute(
  base: Route,
  opt: OptimizedRoute,
): Route {
  return {
    ...base,
    waypoints: opt.waypoints,
    totalDistance: opt.distanceNM,
    estimatedTime: opt.etaHours,
  };
}
