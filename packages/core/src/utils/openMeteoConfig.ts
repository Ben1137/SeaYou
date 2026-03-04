/**
 * Open-Meteo Configuration Utility
 *
 * Provides geolocation-based model selection for optimal resolution and accuracy.
 *
 * Best Practices from Open-Meteo Documentation:
 * - Use regional models for higher resolution when available (up to 1 km)
 * - Use 'auto' timezone for automatic local time conversion
 * - Use 'cell_selection=sea' for marine data to prioritize ocean grid cells
 * - Request only needed variables to optimize response times
 * - Use 'best_match' as fallback for global coverage
 *
 * @see https://open-meteo.com/en/docs
 * @see https://open-meteo.com/en/docs/marine-weather-api
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Geographic region for model selection
 */
export type GeoRegion =
  | 'europe'
  | 'north_america'
  | 'australia'
  | 'asia_pacific'
  | 'global';

/**
 * Weather model configuration
 */
export interface WeatherModel {
  name: string;
  resolution: string;        // e.g., "2 km", "11 km"
  resolutionKm: number;      // Numeric resolution for comparison
  forecastDays: number;
  updateFrequency: string;   // e.g., "Every 3 hours"
  coverage: GeoRegion;
}

/**
 * Marine model configuration
 */
export interface MarineModel {
  name: string;
  resolution: string;
  resolutionKm: number;
  coverage: string;          // Geographic coverage description
  updateFrequency: string;
}

/**
 * Model selection result
 */
export interface ModelSelection {
  weatherModels: string[];   // Ordered by preference (highest resolution first)
  marineModels: string[];
  region: GeoRegion;
  recommendedResolutionKm: number;
}

// ============================================
// MODEL DEFINITIONS
// ============================================

/**
 * Available weather models with their characteristics
 * Ordered by resolution (highest first within each region)
 */
export const WEATHER_MODELS: Record<string, WeatherModel> = {
  // Europe - High Resolution
  'icon_seamless': {
    name: 'ICON Seamless',
    resolution: '2-11 km',
    resolutionKm: 2,
    forecastDays: 7.5,
    updateFrequency: 'Every 3 hours',
    coverage: 'europe'
  },
  'arome_france': {
    name: 'AROME France',
    resolution: '1.5 km',
    resolutionKm: 1.5,
    forecastDays: 2,
    updateFrequency: 'Every hour',
    coverage: 'europe'
  },
  'harmonie_knmi': {
    name: 'HARMONIE KNMI',
    resolution: '2 km',
    resolutionKm: 2,
    forecastDays: 2.5,
    updateFrequency: 'Every hour',
    coverage: 'europe'
  },

  // North America - High Resolution
  'hrrr': {
    name: 'HRRR',
    resolution: '3 km',
    resolutionKm: 3,
    forecastDays: 2,
    updateFrequency: 'Every hour',
    coverage: 'north_america'
  },
  'gfs_seamless': {
    name: 'GFS Seamless',
    resolution: '3-25 km',
    resolutionKm: 3,
    forecastDays: 16,
    updateFrequency: 'Every hour',
    coverage: 'north_america'
  },
  'gem_hrdps': {
    name: 'GEM HRDPS',
    resolution: '2.5 km',
    resolutionKm: 2.5,
    forecastDays: 2,
    updateFrequency: 'Every 6 hours',
    coverage: 'north_america'
  },

  // Global Models
  'ecmwf_ifs': {
    name: 'ECMWF IFS',
    resolution: '25 km',
    resolutionKm: 25,
    forecastDays: 15,
    updateFrequency: 'Every 6 hours',
    coverage: 'global'
  },
  'gfs': {
    name: 'GFS',
    resolution: '25 km',
    resolutionKm: 25,
    forecastDays: 16,
    updateFrequency: 'Every 6 hours',
    coverage: 'global'
  },
  'icon_global': {
    name: 'ICON Global',
    resolution: '11 km',
    resolutionKm: 11,
    forecastDays: 7.5,
    updateFrequency: 'Every 6 hours',
    coverage: 'global'
  },

  // Best match - automatic selection
  'best_match': {
    name: 'Best Match',
    resolution: 'Auto',
    resolutionKm: 0, // Variable
    forecastDays: 16,
    updateFrequency: 'Variable',
    coverage: 'global'
  }
};

/**
 * Available marine models
 */
export const MARINE_MODELS: Record<string, MarineModel> = {
  'best_match': {
    name: 'Best Match',
    resolution: 'Auto',
    resolutionKm: 0,
    coverage: 'Global',
    updateFrequency: 'Variable'
  },
  'ecmwf_wam': {
    name: 'ECMWF WAM',
    resolution: '9 km',
    resolutionKm: 9,
    coverage: 'Global',
    updateFrequency: 'Every 6 hours'
  },
  'dwd_ewam': {
    name: 'DWD EWAM',
    resolution: '5 km',
    resolutionKm: 5,
    coverage: 'Europe',
    updateFrequency: 'Every 12 hours'
  },
  'mfwam': {
    name: 'MeteoFrance MFWAM',
    resolution: '8 km',
    resolutionKm: 8,
    coverage: 'Global',
    updateFrequency: 'Every 12 hours'
  },
  'ncep_gfswave': {
    name: 'NCEP GFS Wave',
    resolution: '16 km',
    resolutionKm: 16,
    coverage: 'Americas (52.5°N to 15°S)',
    updateFrequency: 'Every 6 hours'
  }
};

// ============================================
// GEOGRAPHIC BOUNDARIES
// ============================================

/**
 * Regional boundaries for model selection
 */
const REGIONAL_BOUNDS = {
  europe: {
    north: 72,
    south: 34,
    east: 45,
    west: -25
  },
  north_america: {
    north: 72,
    south: 15,
    east: -50,
    west: -170
  },
  australia: {
    north: -10,
    south: -45,
    east: 155,
    west: 110
  },
  asia_pacific: {
    north: 55,
    south: -10,
    east: 150,
    west: 100
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Determine the geographic region for a given coordinate
 */
export function getGeoRegion(lat: number, lng: number): GeoRegion {
  // Check Europe
  if (lat >= REGIONAL_BOUNDS.europe.south &&
      lat <= REGIONAL_BOUNDS.europe.north &&
      lng >= REGIONAL_BOUNDS.europe.west &&
      lng <= REGIONAL_BOUNDS.europe.east) {
    return 'europe';
  }

  // Check North America (handle longitude wrapping)
  const normalizedLng = lng > 0 && lng < 180 ? lng - 360 : lng;
  if (lat >= REGIONAL_BOUNDS.north_america.south &&
      lat <= REGIONAL_BOUNDS.north_america.north &&
      normalizedLng >= REGIONAL_BOUNDS.north_america.west &&
      normalizedLng <= REGIONAL_BOUNDS.north_america.east) {
    return 'north_america';
  }

  // Check Australia
  if (lat >= REGIONAL_BOUNDS.australia.south &&
      lat <= REGIONAL_BOUNDS.australia.north &&
      lng >= REGIONAL_BOUNDS.australia.west &&
      lng <= REGIONAL_BOUNDS.australia.east) {
    return 'australia';
  }

  // Check Asia Pacific
  if (lat >= REGIONAL_BOUNDS.asia_pacific.south &&
      lat <= REGIONAL_BOUNDS.asia_pacific.north &&
      lng >= REGIONAL_BOUNDS.asia_pacific.west &&
      lng <= REGIONAL_BOUNDS.asia_pacific.east) {
    return 'asia_pacific';
  }

  return 'global';
}

/**
 * Check if coordinates are in Mediterranean Sea region
 * High-resolution European models work well here
 */
function isMediterraneanRegion(lat: number, lng: number): boolean {
  return lat >= 30 && lat <= 46 && lng >= -6 && lng <= 37;
}

/**
 * Check if coordinates are in North Sea / Baltic region
 */
function isNorthSeaRegion(lat: number, lng: number): boolean {
  return lat >= 50 && lat <= 62 && lng >= -5 && lng <= 30;
}

/**
 * Check if coordinates are in Gulf of Mexico / Caribbean
 */
function isGulfCaribbeanRegion(lat: number, lng: number): boolean {
  return lat >= 15 && lat <= 32 && lng >= -100 && lng <= -60;
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Get optimal model selection based on geolocation
 *
 * This function selects the best weather and marine models based on the user's
 * geographic location, prioritizing high-resolution regional models when available.
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns Model selection with ordered preferences
 */
export function getOptimalModels(lat: number, lng: number): ModelSelection {
  const region = getGeoRegion(lat, lng);

  let weatherModels: string[] = [];
  let marineModels: string[] = [];
  let recommendedResolutionKm = 11; // Default global resolution

  switch (region) {
    case 'europe':
      // Europe has highest resolution models available
      weatherModels = ['icon_seamless', 'best_match'];

      // DWD EWAM provides 5km resolution for European waters
      if (isMediterraneanRegion(lat, lng) || isNorthSeaRegion(lat, lng)) {
        marineModels = ['dwd_ewam', 'ecmwf_wam', 'best_match'];
        recommendedResolutionKm = 5;
      } else {
        marineModels = ['ecmwf_wam', 'best_match'];
        recommendedResolutionKm = 9;
      }
      break;

    case 'north_america':
      // HRRR provides 3km resolution for continental US
      weatherModels = ['gfs_seamless', 'best_match'];

      // NCEP GFS Wave for Americas
      if (isGulfCaribbeanRegion(lat, lng)) {
        marineModels = ['ncep_gfswave', 'ecmwf_wam', 'best_match'];
        recommendedResolutionKm = 16;
      } else {
        marineModels = ['ecmwf_wam', 'best_match'];
        recommendedResolutionKm = 9;
      }
      break;

    case 'australia':
    case 'asia_pacific':
      // Use ECMWF for these regions
      weatherModels = ['ecmwf_ifs', 'best_match'];
      marineModels = ['ecmwf_wam', 'mfwam', 'best_match'];
      recommendedResolutionKm = 9;
      break;

    default:
      // Global fallback
      weatherModels = ['best_match'];
      marineModels = ['best_match'];
      recommendedResolutionKm = 25;
  }

  return {
    weatherModels,
    marineModels,
    region,
    recommendedResolutionKm
  };
}

/**
 * Get the primary model for weather API requests
 * Uses 'best_match' by default as Open-Meteo handles optimal selection
 *
 * Note: Open-Meteo's 'best_match' automatically combines the best models
 * for a given location, making it the recommended choice for most use cases.
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @param preferHighResolution - If true, prefer regional high-res models over best_match
 * @returns Model name for API request
 */
export function getPrimaryWeatherModel(
  lat: number,
  lng: number,
  preferHighResolution: boolean = false
): string {
  if (!preferHighResolution) {
    // Open-Meteo's best_match automatically selects optimal models
    return 'best_match';
  }

  const selection = getOptimalModels(lat, lng);
  return selection.weatherModels[0] || 'best_match';
}

/**
 * Get the primary model for marine API requests
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @param preferHighResolution - If true, prefer regional high-res models
 * @returns Model name for API request
 */
export function getPrimaryMarineModel(
  lat: number,
  lng: number,
  preferHighResolution: boolean = false
): string {
  if (!preferHighResolution) {
    return 'best_match';
  }

  const selection = getOptimalModels(lat, lng);
  return selection.marineModels[0] || 'best_match';
}

/**
 * Get the optimal model for a given location.
 * Shared utility used by both weatherService and marineGridService.
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @param isMarine - True for marine model, false for weather model
 * @param preferHighResolution - Value of WEATHER_CONSTANTS.PREFER_HIGH_RESOLUTION
 * @param fallbackModel - Value of WEATHER_CONSTANTS.MODEL
 */
export function getModelForLocation(
  lat: number,
  lng: number,
  isMarine: boolean = false,
  preferHighResolution: boolean = true,
  fallbackModel: string = 'best_match'
): string {
  if (preferHighResolution) {
    return isMarine
      ? getPrimaryMarineModel(lat, lng, true)
      : getPrimaryWeatherModel(lat, lng, true);
  }
  return fallbackModel;
}

// ============================================
// API PARAMETER HELPERS
// ============================================

/**
 * Open-Meteo API parameter presets following best practices
 */
export const API_PARAMS = {
  /**
   * Marine API parameters - comprehensive set for marine applications
   * Following Open-Meteo Marine API best practices
   */
  marine: {
    hourly: [
      // Primary wave data
      'wave_height',
      'wave_direction',
      'wave_period',
      'wave_peak_period',
      // Wind wave components
      'wind_wave_height',
      'wind_wave_direction',
      'wind_wave_period',
      'wind_wave_peak_period',
      // Primary swell
      'swell_wave_height',
      'swell_wave_direction',
      'swell_wave_period',
      'swell_wave_peak_period',
      // Ocean data
      'sea_surface_temperature',
      'ocean_current_velocity',
      'ocean_current_direction',
      // Sea level (tidal data)
      'sea_level_height_msl'
    ].join(','),

    daily: [
      'wave_height_max',
      'wave_direction_dominant',
      'wave_period_max',
      'swell_wave_height_max',
      'swell_wave_direction_dominant',
      'swell_wave_period_max',
      'swell_wave_peak_period_max',
      'wind_wave_height_max',
      'wind_wave_direction_dominant',
      'wind_wave_period_max',
      'wind_wave_peak_period_max'
    ].join(','),

    current: [
      'wave_height',
      'wave_direction',
      'wave_period',
      'wave_peak_period',
      'wind_wave_height',
      'wind_wave_direction',
      'wind_wave_period',
      'swell_wave_height',
      'swell_wave_direction',
      'swell_wave_period',
      'sea_surface_temperature',
      'ocean_current_velocity',
      'ocean_current_direction',
      'sea_level_height_msl'
    ].join(',')
  },

  /**
   * Weather/Forecast API parameters
   */
  forecast: {
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'pressure_msl',
      'surface_pressure',
      'cloud_cover',
      'visibility',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'uv_index'
    ].join(','),

    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'sunrise',
      'sunset',
      'daylight_duration',
      'sunshine_duration',
      'uv_index_max',
      'precipitation_sum',
      'precipitation_hours',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'wind_direction_10m_dominant'
    ].join(','),

    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'weather_code',
      'cloud_cover',
      'pressure_msl',
      'surface_pressure',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'visibility'
    ].join(',')
  }
};

/**
 * Cell selection options for Open-Meteo API
 *
 * - 'sea': Prioritizes ocean grid cells (best for marine data)
 * - 'land': Uses elevation-based selection (best for coastal/land)
 * - 'nearest': Selects closest available grid cell
 */
export type CellSelection = 'sea' | 'land' | 'nearest';

/**
 * Get recommended cell selection based on data type
 */
export function getRecommendedCellSelection(isMarineData: boolean): CellSelection {
  return isMarineData ? 'sea' : 'land';
}

/**
 * Build optimized API parameters for marine requests
 */
export function buildMarineParams(
  lat: number,
  lng: number,
  options: {
    forecastDays?: number;
    model?: string;
    includeDaily?: boolean;
    includeCurrent?: boolean;
  } = {}
): URLSearchParams {
  const {
    forecastDays = 7,
    model,
    includeDaily = true,
    includeCurrent = true
  } = options;

  const selectedModel = model || getPrimaryMarineModel(lat, lng);

  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    hourly: API_PARAMS.marine.hourly,
    timezone: 'auto', // Best practice: auto-detect timezone
    forecast_days: forecastDays.toString(),
    models: selectedModel,
    cell_selection: 'sea' // Best practice: prioritize ocean cells for marine data
  });

  if (includeDaily) {
    params.set('daily', API_PARAMS.marine.daily);
  }

  if (includeCurrent) {
    params.set('current', API_PARAMS.marine.current);
  }

  return params;
}

/**
 * Build optimized API parameters for weather/forecast requests
 */
export function buildForecastParams(
  lat: number,
  lng: number,
  options: {
    forecastDays?: number;
    model?: string;
    includeDaily?: boolean;
    includeCurrent?: boolean;
    cellSelection?: CellSelection;
  } = {}
): URLSearchParams {
  const {
    forecastDays = 7,
    model,
    includeDaily = true,
    includeCurrent = true,
    cellSelection = 'land'
  } = options;

  const selectedModel = model || getPrimaryWeatherModel(lat, lng);

  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    hourly: API_PARAMS.forecast.hourly,
    timezone: 'auto', // Best practice: auto-detect timezone
    forecast_days: forecastDays.toString(),
    models: selectedModel,
    cell_selection: cellSelection
  });

  if (includeDaily) {
    params.set('daily', API_PARAMS.forecast.daily);
  }

  if (includeCurrent) {
    params.set('current', API_PARAMS.forecast.current);
  }

  return params;
}

// ============================================
// EXPORTS
// ============================================

export default {
  getGeoRegion,
  getOptimalModels,
  getPrimaryWeatherModel,
  getPrimaryMarineModel,
  buildMarineParams,
  buildForecastParams,
  getRecommendedCellSelection,
  API_PARAMS,
  WEATHER_MODELS,
  MARINE_MODELS
};
