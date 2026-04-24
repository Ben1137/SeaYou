/**
 * Route Safety Service — Phase 2 of the Route Planner roadmap.
 *
 * Responsibilities:
 *  1. `sampleWeatherAlongRoute` — fetch wave / current / wind at each
 *     segment midpoint at the estimated arrival time of that midpoint.
 *  2. `analyzeRouteSafety` — combine the weather samples with:
 *       - persona-aware thresholds (green / amber / red per segment)
 *       - Turf.js landmask intersection (coastline crossing)
 *       - GEBCO WMS depth at midpoint (vs. vessel draft + safety margin)
 *     and return both per-segment status + a flat list of `WeatherHazard`
 *     records for the UI.
 *
 * Why a new file: keeps the scope additive. `nauticalChartService.ts` stays
 * focused on static seamark hazards (OSM); this module handles the dynamic
 * weather-along-route layer.
 *
 * External dependencies:
 *  - Open-Meteo Marine API (wave_height, ocean_current_velocity)
 *  - Open-Meteo Forecast API (wind_speed_10m, wind_gusts_10m)
 *  - GEBCO WMS GetFeatureInfo (bathymetric depth)
 *  - @turf/line-intersect (coastline intersection test)
 */

import type { Feature, FeatureCollection, LineString } from 'geojson';
import { lineString, featureCollection } from '@turf/helpers';
import lineIntersect from '@turf/line-intersect';
import type { Waypoint } from '../types/navigation';
import type { OnboardingPersona } from '../types/preferences';
import { API_ENDPOINTS, WEATHER_CONSTANTS } from '../constants';
import { deduplicatedFetch } from '../utils/requestDeduplication';
import { globalRateLimiter } from './apiRateLimiter';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type SegmentSeverity = 'safe' | 'caution' | 'danger';

export interface SegmentWeatherSample {
  segmentIndex: number;
  midpoint: { lat: number; lon: number };
  /** Hours from departure when the vessel reaches the midpoint. */
  etaHours: number;
  /** ISO timestamp of the hour used for sampling (forecast hour). */
  sampledAt: string;
  windSpeedKmh: number | null;
  windGustsKmh: number | null;
  waveHeightM: number | null;
  currentSpeedMs: number | null;
}

export interface SegmentSafety {
  segmentIndex: number;
  severity: SegmentSeverity;
  weather: SegmentWeatherSample | null;
  reasons: string[];
  landIntersect: boolean;
  depthM: number | null; // positive number = depth below sea level in meters
  tooShallow: boolean;
}

export interface WeatherHazard {
  segmentIndex: number;
  severity: SegmentSeverity;
  kind: 'wind' | 'wave' | 'current' | 'land' | 'shallow';
  message: string;
}

export interface RouteSafetyAnalysis {
  segments: SegmentSafety[];
  weatherHazards: WeatherHazard[];
  /** True when every segment is 'safe' (no caution/danger anywhere). */
  isClear: boolean;
}

export interface PersonaThresholds {
  /** Wave height triggering amber (meters). */
  waveCaution: number;
  /** Wave height triggering red (meters). */
  waveDanger: number;
  /** Sustained wind triggering amber (km/h). */
  windCaution: number;
  /** Sustained wind triggering red (km/h). */
  windDanger: number;
  /** Ocean current speed triggering amber (m/s). */
  currentCaution: number;
  /** Ocean current speed triggering red (m/s). */
  currentDanger: number;
}

/**
 * Per-persona safety thresholds. Tuned for sensible defaults — users will
 * be able to override these from `AlertContext` in Phase 7.
 */
export const PERSONA_THRESHOLDS: Record<
  OnboardingPersona | 'default',
  PersonaThresholds
> = {
  mariner: {
    waveCaution: 1.5,
    waveDanger: 2.5,
    windCaution: 25,
    windDanger: 40,
    currentCaution: 0.5,
    currentDanger: 1.0,
  },
  surfer: {
    waveCaution: 3.0,
    waveDanger: 5.0,
    windCaution: 35,
    windDanger: 55,
    currentCaution: 0.8,
    currentDanger: 1.5,
  },
  beachgoer: {
    waveCaution: 0.8,
    waveDanger: 1.5,
    windCaution: 18,
    windDanger: 30,
    currentCaution: 0.3,
    currentDanger: 0.7,
  },
  diver: {
    waveCaution: 1.0,
    waveDanger: 2.0,
    windCaution: 20,
    windDanger: 35,
    currentCaution: 0.4,
    currentDanger: 0.8,
  },
  default: {
    waveCaution: 1.5,
    waveDanger: 2.5,
    windCaution: 25,
    windDanger: 40,
    currentCaution: 0.5,
    currentDanger: 1.0,
  },
};

export function getPersonaThresholds(
  persona: OnboardingPersona | null | undefined,
): PersonaThresholds {
  if (!persona) return PERSONA_THRESHOLDS.default;
  return PERSONA_THRESHOLDS[persona] ?? PERSONA_THRESHOLDS.default;
}

// ─────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────

const NM_TO_KM = 1.852;
const EARTH_R_NM = 3440.065;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function haversineNM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_NM * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function midpoint(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): { lat: number; lon: number } {
  return { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
}

// ─────────────────────────────────────────────────────────────────
// Open-Meteo sampling
// ─────────────────────────────────────────────────────────────────

/**
 * Sample weather at each segment midpoint at the hour the vessel is
 * expected to be there (based on cumulative distance / averageSpeed).
 *
 * Uses hourly bulk requests (one call for all midpoints) to stay inside
 * Open-Meteo's rate budget. Returns one sample per segment. A null value
 * on any field means the API did not return data for that coordinate.
 */
export async function sampleWeatherAlongRoute(
  waypoints: Waypoint[],
  averageSpeedKnots: number,
  departureTime: Date = new Date(),
): Promise<SegmentWeatherSample[]> {
  if (waypoints.length < 2 || averageSpeedKnots <= 0) return [];

  // Build midpoints + cumulative ETA per segment.
  const segs: { midpoint: { lat: number; lon: number }; etaHours: number }[] =
    [];
  let cumulativeNM = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const legNM = haversineNM(a, b);
    // Midpoint ETA = time to reach the halfway point of this leg.
    const midNM = cumulativeNM + legNM / 2;
    cumulativeNM += legNM;
    segs.push({
      midpoint: midpoint(a, b),
      etaHours: midNM / averageSpeedKnots,
    });
  }

  // Build an hourly window wide enough to cover the whole route.
  const totalHours = Math.max(1, Math.ceil(cumulativeNM / averageSpeedKnots) + 2);
  const pastDays = 0;
  const forecastDays = Math.min(16, Math.ceil(totalHours / 24) + 1);

  const lats = segs.map((s) => s.midpoint.lat.toFixed(4)).join(',');
  const lngs = segs.map((s) => s.midpoint.lon.toFixed(4)).join(',');

  const marineParams = new URLSearchParams({
    latitude: lats,
    longitude: lngs,
    hourly: 'wave_height,ocean_current_velocity',
    timezone: 'UTC',
    past_days: String(pastDays),
    forecast_days: String(forecastDays),
    cell_selection: WEATHER_CONSTANTS.MARINE_CELL_SELECTION,
  });

  const forecastParams = new URLSearchParams({
    latitude: lats,
    longitude: lngs,
    hourly: 'wind_speed_10m,wind_gusts_10m',
    timezone: 'UTC',
    past_days: String(pastDays),
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
    console.warn('[routeSafetyService] weather sample fetch failed', e);
    return segs.map((s, i) => ({
      segmentIndex: i,
      midpoint: s.midpoint,
      etaHours: s.etaHours,
      sampledAt: '',
      windSpeedKmh: null,
      windGustsKmh: null,
      waveHeightM: null,
      currentSpeedMs: null,
    }));
  }

  const marineArr = Array.isArray(marineResp) ? marineResp : [marineResp];
  const forecastArr = Array.isArray(forecastResp)
    ? forecastResp
    : [forecastResp];

  return segs.map((s, i) => {
    const marine = marineArr[i] ?? {};
    const forecast = forecastArr[i] ?? {};
    const targetMs = departureTime.getTime() + s.etaHours * 3600 * 1000;

    const marineTimes: string[] | undefined = marine.hourly?.time;
    const waveSeries: (number | null)[] | undefined =
      marine.hourly?.wave_height;
    const currentSeries: (number | null)[] | undefined =
      marine.hourly?.ocean_current_velocity;
    const forecastTimes: string[] | undefined = forecast.hourly?.time;
    const windSeries: (number | null)[] | undefined =
      forecast.hourly?.wind_speed_10m;
    const gustSeries: (number | null)[] | undefined =
      forecast.hourly?.wind_gusts_10m;

    const marineIdx = pickHourIndex(marineTimes, targetMs);
    const forecastIdx = pickHourIndex(forecastTimes, targetMs);

    return {
      segmentIndex: i,
      midpoint: s.midpoint,
      etaHours: s.etaHours,
      sampledAt: marineTimes?.[marineIdx] ?? forecastTimes?.[forecastIdx] ?? '',
      waveHeightM:
        marineIdx >= 0 && waveSeries ? waveSeries[marineIdx] ?? null : null,
      currentSpeedMs:
        marineIdx >= 0 && currentSeries
          ? currentSeries[marineIdx] ?? null
          : null,
      windSpeedKmh:
        forecastIdx >= 0 && windSeries
          ? windSeries[forecastIdx] ?? null
          : null,
      windGustsKmh:
        forecastIdx >= 0 && gustSeries
          ? gustSeries[forecastIdx] ?? null
          : null,
    };
  });
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
// GEBCO depth
// ─────────────────────────────────────────────────────────────────

const GEBCO_WMS = 'https://wms.gebco.net/mapserv';

/**
 * Real implementation of `getDepthAtLocation` using GEBCO WMS
 * GetFeatureInfo. Returns depth below sea level in **meters (positive)**,
 * or null when the service is unreachable or the pixel is on land.
 *
 * GEBCO returns elevation in meters where negative = under water. We flip
 * the sign so the rest of the codebase can reason about positive depth.
 */
export async function getDepthAtLocationGEBCO(
  lat: number,
  lon: number,
): Promise<number | null> {
  // Tiny 2-pixel bbox around the target so GetFeatureInfo resolves to our
  // exact coord. GEBCO WMS expects bbox in the form "minx,miny,maxx,maxy"
  // for CRS:84 (lon,lat order), or "miny,minx,maxy,maxx" for EPSG:4326 (lat,lon).
  const eps = 0.0005;
  const bbox = [lon - eps, lat - eps, lon + eps, lat + eps].join(',');

  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetFeatureInfo',
    layers: 'GEBCO_LATEST',
    query_layers: 'GEBCO_LATEST',
    srs: 'EPSG:4326',
    // In WMS 1.1.1 + EPSG:4326 the bbox is lon,lat (x,y) order.
    bbox,
    width: '2',
    height: '2',
    x: '1',
    y: '1',
    info_format: 'text/plain',
  });

  try {
    const res = await fetch(`${GEBCO_WMS}?${params.toString()}`);
    if (!res.ok) return null;
    const text = await res.text();
    // Response is plain text, e.g. "value_0: '-1523'". We grab the first
    // number we see after a colon; fall back to any signed integer.
    const m =
      text.match(/value_[^:]*:\s*['"]?(-?\d+(?:\.\d+)?)/) ||
      text.match(/(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const elevationM = parseFloat(m[1]);
    if (!Number.isFinite(elevationM)) return null;
    // Negative elevation = under water. Positive = above sea level (land).
    return elevationM < 0 ? -elevationM : null;
  } catch (e) {
    console.warn('[routeSafetyService] GEBCO fetch failed', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Landmask via Turf
// ─────────────────────────────────────────────────────────────────

/**
 * Build per-segment land-intersect flags. Coastline is the Natural Earth
 * 10m "ne_10m_coastline" GeoJSON (lines, not polygons) — so we use
 * `lineIntersect` and flag segments whose line crosses the coastline.
 *
 * When no coastline data is provided we return an array of `false`s —
 * the layer responsible for loading the coastline may not have mounted
 * yet; better to silently skip than to block the route analysis.
 */
export function computeLandIntersects(
  waypoints: Waypoint[],
  coastline: FeatureCollection | null | undefined,
): boolean[] {
  const result = new Array(Math.max(0, waypoints.length - 1)).fill(false);
  if (!coastline || !coastline.features || coastline.features.length === 0) {
    return result;
  }

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const seg: Feature<LineString> = lineString([
      [a.lon, a.lat],
      [b.lon, b.lat],
    ]);

    // `lineIntersect` only accepts LineString / MultiLineString features.
    // The Natural Earth coastline file is a FeatureCollection of
    // MultiLineStrings, which works directly.
    const intersects = lineIntersect(
      seg,
      coastline as FeatureCollection<any>,
    );
    if (intersects.features.length > 0) {
      result[i] = true;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────
// Persona colorizer + orchestrator
// ─────────────────────────────────────────────────────────────────

interface AnalyzeOptions {
  persona?: OnboardingPersona | null;
  vesselDraftM?: number;
  safetyMarginM?: number;
  coastline?: FeatureCollection | null;
  departureTime?: Date;
  /** Pre-fetched samples — pass these to skip the network round-trip. */
  samples?: SegmentWeatherSample[];
  /** Skip the GEBCO depth check (faster; no depth hazards surfaced). */
  skipDepth?: boolean;
}

/**
 * Full per-segment safety analysis. Sampling + landmask + depth + color.
 *
 * Designed to be the single call from `RoutePlanningView` after a route
 * change. Depth lookups are parallelised but still cost one HTTP round
 * trip per segment — callers can opt out via `skipDepth`.
 */
export async function analyzeRouteSafety(
  waypoints: Waypoint[],
  averageSpeedKnots: number,
  options: AnalyzeOptions = {},
): Promise<RouteSafetyAnalysis> {
  if (waypoints.length < 2) {
    return { segments: [], weatherHazards: [], isClear: true };
  }

  const thresholds = getPersonaThresholds(options.persona);
  const draft = options.vesselDraftM ?? 2.0;
  const marginM = options.safetyMarginM ?? 2.0;

  const samples =
    options.samples ??
    (await sampleWeatherAlongRoute(
      waypoints,
      averageSpeedKnots,
      options.departureTime ?? new Date(),
    ));

  const landIntersects = computeLandIntersects(waypoints, options.coastline);

  // Depth per segment midpoint — parallel, but tolerant to failures.
  const depthsPromise: Promise<(number | null)[]> = options.skipDepth
    ? Promise.resolve(new Array(waypoints.length - 1).fill(null))
    : Promise.all(
        samples.map((s) =>
          getDepthAtLocationGEBCO(s.midpoint.lat, s.midpoint.lon).catch(
            () => null,
          ),
        ),
      );
  const depths = await depthsPromise;

  const segments: SegmentSafety[] = [];
  const weatherHazards: WeatherHazard[] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const sample = samples[i] ?? null;
    const depthM = depths[i];
    const landIntersect = landIntersects[i] ?? false;
    const requiredDepth = draft + marginM;
    const tooShallow = depthM !== null && depthM < requiredDepth;

    let severity: SegmentSeverity = 'safe';
    const reasons: string[] = [];
    const bump = (next: SegmentSeverity) => {
      const rank = { safe: 0, caution: 1, danger: 2 } as const;
      if (rank[next] > rank[severity]) severity = next;
    };

    // Weather thresholds
    if (sample?.waveHeightM !== null && sample?.waveHeightM !== undefined) {
      if (sample.waveHeightM >= thresholds.waveDanger) {
        bump('danger');
        const msg = `Wave height ${sample.waveHeightM.toFixed(1)} m exceeds danger threshold (${thresholds.waveDanger} m)`;
        reasons.push(msg);
        weatherHazards.push({
          segmentIndex: i,
          severity: 'danger',
          kind: 'wave',
          message: msg,
        });
      } else if (sample.waveHeightM >= thresholds.waveCaution) {
        bump('caution');
        const msg = `Wave height ${sample.waveHeightM.toFixed(1)} m above caution threshold (${thresholds.waveCaution} m)`;
        reasons.push(msg);
        weatherHazards.push({
          segmentIndex: i,
          severity: 'caution',
          kind: 'wave',
          message: msg,
        });
      }
    }

    if (sample?.windSpeedKmh !== null && sample?.windSpeedKmh !== undefined) {
      if (sample.windSpeedKmh >= thresholds.windDanger) {
        bump('danger');
        const msg = `Wind ${sample.windSpeedKmh.toFixed(0)} km/h exceeds danger threshold (${thresholds.windDanger} km/h)`;
        reasons.push(msg);
        weatherHazards.push({
          segmentIndex: i,
          severity: 'danger',
          kind: 'wind',
          message: msg,
        });
      } else if (sample.windSpeedKmh >= thresholds.windCaution) {
        bump('caution');
        const msg = `Wind ${sample.windSpeedKmh.toFixed(0)} km/h above caution threshold (${thresholds.windCaution} km/h)`;
        reasons.push(msg);
        weatherHazards.push({
          segmentIndex: i,
          severity: 'caution',
          kind: 'wind',
          message: msg,
        });
      }
    }

    if (
      sample?.currentSpeedMs !== null &&
      sample?.currentSpeedMs !== undefined
    ) {
      if (sample.currentSpeedMs >= thresholds.currentDanger) {
        bump('danger');
        const msg = `Current ${sample.currentSpeedMs.toFixed(2)} m/s exceeds danger threshold (${thresholds.currentDanger} m/s)`;
        reasons.push(msg);
        weatherHazards.push({
          segmentIndex: i,
          severity: 'danger',
          kind: 'current',
          message: msg,
        });
      } else if (sample.currentSpeedMs >= thresholds.currentCaution) {
        bump('caution');
        const msg = `Current ${sample.currentSpeedMs.toFixed(2)} m/s above caution threshold (${thresholds.currentCaution} m/s)`;
        reasons.push(msg);
        weatherHazards.push({
          segmentIndex: i,
          severity: 'caution',
          kind: 'current',
          message: msg,
        });
      }
    }

    if (landIntersect) {
      bump('danger');
      const msg = `Segment crosses coastline — route transits land. Drag waypoints offshore.`;
      reasons.push(msg);
      weatherHazards.push({
        segmentIndex: i,
        severity: 'danger',
        kind: 'land',
        message: msg,
      });
    }

    if (tooShallow && depthM !== null) {
      bump('danger');
      const msg = `Shallow water (${depthM.toFixed(1)} m) — below draft + margin (${requiredDepth.toFixed(1)} m)`;
      reasons.push(msg);
      weatherHazards.push({
        segmentIndex: i,
        severity: 'danger',
        kind: 'shallow',
        message: msg,
      });
    }

    segments.push({
      segmentIndex: i,
      severity,
      weather: sample,
      reasons,
      landIntersect,
      depthM,
      tooShallow,
    });
  }

  return {
    segments,
    weatherHazards,
    isClear: segments.every((s) => s.severity === 'safe'),
  };
}

// Silence unused-import warnings in builds that treeshake aggressively.
export const __turfBundle = { lineString, featureCollection, lineIntersect };
// Unit conversion helper for callers that need km from NM.
export const nmToKm = (nm: number) => nm * NM_TO_KM;
