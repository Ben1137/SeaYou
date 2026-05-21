/**
 * modelComparisonService — fetch current conditions from multiple forecast
 * models simultaneously and surface the inter-model spread so the UI can
 * warn when models disagree significantly.
 */

import { WEATHER_MODELS } from '../utils/openMeteoConfig';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModelComparisonResult {
  model: string;
  modelName: string;
  waveHeight: number | null;
  wavePeriod: number | null;
  swellHeight: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  seaTemp: number | null;
}

export interface ComparisonResponse {
  forecastTime: string;
  lat: number;
  lng: number;
  perModel: ModelComparisonResult[];
  spread: {
    waveHeight: number;
    windSpeed: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(
    values.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / values.length,
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Fetch current observations from several Open-Meteo models in parallel and
 * return per-model results together with a spread score.
 *
 * Each model triggers two requests (marine + forecast) so avoid calling this
 * with more than 3 models at once — both to respect Open-Meteo rate limits and
 * to keep latency under ~2 s on a mobile connection.
 */
/**
 * Map a weather/atmosphere model ID to the nearest supported marine model.
 * Open-Meteo's marine API only accepts its own model list — passing a
 * weather-only ID (e.g. 'best_match', 'icon_seamless') returns HTTP 400
 * with no current data, causing wave/SST fields to show null.
 */
const WEATHER_TO_MARINE_MODEL: Record<string, string> = {
  best_match:          'best_match',   // marine API also supports best_match
  ecmwf_ifs025:        'ecmwf_wam',
  ecmwf_ifs09:         'ecmwf_wam',
  icon_seamless:       'best_match',   // no direct ICON marine; use best_match
  gfs_seamless:        'ncep_gfswave',
  ukmo_seamless:       'best_match',
  meteofrance_seamless:'mfwam',
  knmi_seamless:       'best_match',
};

function marineModelFor(weatherModelId: string): string {
  return WEATHER_TO_MARINE_MODEL[weatherModelId] ?? 'best_match';
}

export async function compareModels(
  lat: number,
  lng: number,
  modelIds: string[],
): Promise<ComparisonResponse> {
  const marineVars = 'wave_height,wave_period,swell_wave_height,sea_surface_temperature';
  const forecastBase =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=wind_speed_10m,wind_direction_10m`;

  const [marineResults, windResults] = await Promise.all([
    Promise.all(
      modelIds.map((id) => {
        const marineId = marineModelFor(id);
        const url =
          `https://marine-api.open-meteo.com/v1/marine` +
          `?latitude=${lat}&longitude=${lng}` +
          `&current=${marineVars}` +
          `&cell_selection=sea` +
          `&models=${marineId}`;
        return fetch(url)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
      }),
    ),
    Promise.all(
      modelIds.map((id) =>
        fetch(`${forecastBase}&models=${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ),
  ]);

  const perModel: ModelComparisonResult[] = modelIds.map((modelId, i) => ({
    model: modelId,
    modelName: WEATHER_MODELS[modelId]?.name ?? modelId,
    waveHeight: marineResults[i]?.current?.wave_height ?? null,
    wavePeriod: marineResults[i]?.current?.wave_period ?? null,
    swellHeight: marineResults[i]?.current?.swell_wave_height ?? null,
    windSpeed: windResults[i]?.current?.wind_speed_10m ?? null,
    windDirection: windResults[i]?.current?.wind_direction_10m ?? null,
    seaTemp: marineResults[i]?.current?.sea_surface_temperature ?? null,
  }));

  const waveValues = perModel
    .map((m) => m.waveHeight)
    .filter((v): v is number => v !== null);
  const windValues = perModel
    .map((m) => m.windSpeed)
    .filter((v): v is number => v !== null);

  return {
    forecastTime: new Date().toISOString(),
    lat,
    lng,
    perModel,
    spread: {
      waveHeight: stddev(waveValues),
      windSpeed: stddev(windValues),
    },
  };
}
