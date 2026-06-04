/**
 * Application Constants
 *
 * Centralized configuration values and magic numbers extracted for maintainability.
 */

// ==================== API ENDPOINTS ====================
// Environment detection for API URL switching
// - Development (localhost): Use Vite proxy to avoid CORS issues
// - Production (GitHub Pages, etc.): Use direct API URLs (CORS typically allowed for deployed sites)

/**
 * Check if running in development mode (localhost)
 * This function is evaluated at runtime, not compile time
 */
function isDevEnvironment(): boolean {
  // Server-side rendering or test environment - use production URLs
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;

  // Development environments
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return true;
  }

  // Local network IP addresses (for mobile testing)
  if (/^192\.168\.\d+\.\d+$/.test(hostname) || /^10\.\d+\.\d+\.\d+$/.test(hostname)) {
    return true;
  }

  // Production: GitHub Pages, Vercel, Netlify, or any other deployed domain
  return false;
}

/**
 * Get the appropriate API base URL based on environment
 * Uses proxy in dev to avoid CORS, direct URLs in production
 */
function getApiUrl(devProxy: string, prodUrl: string): string {
  return isDevEnvironment() ? devProxy : prodUrl;
}

export const API_ENDPOINTS = {
  // Marine weather API
  MARINE: getApiUrl('/api/marine/v1/marine', 'https://marine-api.open-meteo.com/v1/marine'),
  // General weather forecast API
  FORECAST: getApiUrl('/api/weather/v1/forecast', 'https://api.open-meteo.com/v1/forecast'),
  // Location search (forward geocoding)
  GEOCODING: getApiUrl('/api/geocoding/v1/search', 'https://geocoding-api.open-meteo.com/v1/search'),
  // Reverse geocoding (coordinates to location name)
  REVERSE_GEOCODING: getApiUrl('/api/geocoding/v1/reverse', 'https://geocoding-api.open-meteo.com/v1/reverse'),
  // These APIs don't have CORS issues - use direct URLs always
  OVERPASS: 'https://overpass-api.de/api/interpreter',
  NOMINATIM: 'https://nominatim.openstreetmap.org/search',
} as const;

// ==================== CACHE CONFIGURATION ====================
export const CACHE_CONFIG = {
  /** Maximum cache size in bytes (50 MB) */
  MAX_SIZE_BYTES: 50 * 1024 * 1024,

  /** Time-to-live for different data types (in milliseconds) */
  TTL: {
    MARINE: 30 * 60 * 1000,       // 30 minutes
    FORECAST: 60 * 60 * 1000,     // 1 hour
    CURRENT: 15 * 60 * 1000,      // 15 minutes
    MULTIMODEL: 60 * 60 * 1000,   // 1 hour
    GRIB: 24 * 60 * 60 * 1000,    // 24 hours
    GEOCODING: 7 * 24 * 60 * 60 * 1000, // 1 week
  },

  /** Workbox runtime caching configuration */
  WORKBOX: {
    API_MAX_ENTRIES: 100,
    API_MAX_AGE_SECONDS: 60 * 60,        // 1 hour
    MARINE_MAX_ENTRIES: 50,
    MARINE_MAX_AGE_SECONDS: 30 * 60,     // 30 minutes
    GEOCODING_MAX_ENTRIES: 100,
    GEOCODING_MAX_AGE_SECONDS: 7 * 24 * 60 * 60, // 1 week
    IMAGES_MAX_ENTRIES: 60,
    IMAGES_MAX_AGE_SECONDS: 30 * 24 * 60 * 60,  // 30 days
  },
} as const;

// ==================== API REQUEST CONFIGURATION ====================
export const REQUEST_CONFIG = {
  /** Default timeout for fetch requests (in milliseconds) */
  DEFAULT_TIMEOUT_MS: 30000,      // 30 seconds — Open-Meteo 10-day payloads can be 3MB+

  /** Overpass API specific timeout (in seconds) */
  OVERPASS_TIMEOUT_SECONDS: 25,

  /** Retry configuration */
  RETRY: {
    MAX_ATTEMPTS: 3,
    INITIAL_DELAY_MS: 1000,       // 1 second
    MAX_DELAY_MS: 10000,          // 10 seconds
    BACKOFF_MULTIPLIER: 2,        // Exponential backoff
  },

  /** Rate limiting */
  RATE_LIMIT: {
    MAX_REQUESTS_PER_MINUTE: 60,
    DEBOUNCE_MS: 500,             // Map movement debounce
    MAX_CONCURRENT_REQUESTS: 2,   // Throttle queue: max simultaneous API calls
    COOLDOWN_AFTER_429_MS: 30000, // Global cooldown after any 429 response
    NEGATIVE_CACHE_TTL_MS: 15000, // Cache 429'd URLs to prevent retry cascade
  },

  /** Grid request limits to avoid HTTP 414 (URL too large) */
  GRID_LIMITS: {
    /** Maximum coordinates per API request (keeps URL under ~8000 chars for modern browsers) */
    MAX_COORDINATES_PER_REQUEST: 256,
    /** Maximum grid points to request total (allows up to 16x16 grids for full viewport coverage) */
    MAX_TOTAL_GRID_POINTS: 256,
    /** Chunk size for batched requests */
    CHUNK_SIZE: 25,
  },
} as const;

// ==================== WEATHER & MARINE CONSTANTS ====================
export const WEATHER_CONSTANTS = {
  /** Forecast window in days (10-day forecast like Apple Weather) */
  FORECAST_DAYS: 10,

  /** Hourly data points per day */
  HOURS_PER_DAY: 24,

  /**
   * Timezone for API requests
   * Best Practice: Use 'auto' to automatically detect local timezone
   * This provides better UX as times are returned in user's local timezone
   * @see https://open-meteo.com/en/docs
   */
  TIMEZONE: 'auto',

  /**
   * Default model selection - 'best_match' lets Open-Meteo auto-select
   * When PREFER_HIGH_RESOLUTION is true, geolocation-based selection overrides this
   */
  MODEL: 'best_match',

  /**
   * Enable geolocation-based high-resolution model selection
   * When true, the app selects optimal models based on user's location:
   * - Europe: ICON Seamless (2km), DWD EWAM (5km marine)
   * - North America: GFS Seamless (3km), HRRR (3km), NCEP GFS Wave
   * - Asia-Pacific: ECMWF IFS, ECMWF WAM
   * - Global: best_match (automatic)
   * @see packages/core/src/utils/openMeteoConfig.ts for full model selection logic
   */
  PREFER_HIGH_RESOLUTION: true,

  /**
   * Enable 15-minute data for ocean currents
   * When true, requests minutely_15 data for ocean_current_velocity and ocean_current_direction
   * Provides higher temporal resolution for real-time current tracking
   */
  USE_15_MINUTE_DATA: true,

  /**
   * Cell selection for marine data
   * Best Practice: Use 'sea' to prioritize ocean grid cells for marine data
   * Options: 'sea' | 'land' | 'nearest'
   * @see https://open-meteo.com/en/docs/marine-weather-api
   */
  MARINE_CELL_SELECTION: 'sea',

  /**
   * Cell selection for land/coastal data
   * Best Practice: Use 'land' for elevation-based grid selection
   */
  LAND_CELL_SELECTION: 'land',

  /** Wave height threshold for ocean detection (meters) */
  WAVE_HEIGHT_LAND_THRESHOLD: 0.05,
} as const;

// ==================== NAVIGATION & GEOGRAPHY ====================
export const NAVIGATION_CONSTANTS = {
  /** Nautical mile in meters */
  NAUTICAL_MILE_METERS: 1852,

  /** Knot to m/s conversion */
  KNOT_TO_MS: 0.514444,

  /** Default map grid configuration */
  MAP_GRID: {
    ROWS: 4,
    COLS: 4,
    TOTAL_POINTS: 16,
  },

  /** Search configuration */
  SEARCH: {
    MIN_QUERY_LENGTH: 3,
    MAX_RESULTS: 5,
    MARINA_PARALLEL_REQUESTS: 4,
  },

  /** Default location (Tel Aviv) */
  DEFAULT_LOCATION: {
    name: 'Tel Aviv',
    lat: 32.0853,
    lng: 34.7818,
    country: 'Israel',
  },
} as const;

// ==================== UI CONSTANTS ====================
export const UI_CONSTANTS = {
  /** Auto-refresh interval for weather data (in milliseconds) */
  AUTO_REFRESH_INTERVAL_MS: 15 * 60 * 1000, // 15 minutes

  /** Service worker update check interval (in milliseconds) */
  SW_UPDATE_CHECK_INTERVAL_MS: 60 * 60 * 1000, // 1 hour

  /** Chart and visualization */
  CHART: {
    MAX_VISIBLE_HOURS: 24,
    ANIMATION_DURATION_MS: 300,
  },

  /** Haptic feedback patterns */
  VIBRATION: {
    SHORT: [200],
    MEDIUM: [100, 50, 100],
    LONG: [200, 100, 200],
  },
} as const;

// ==================== VALIDATION THRESHOLDS ====================
export const VALIDATION_THRESHOLDS = {
  /** Weather alert thresholds */
  ALERTS: {
    WAVE_HEIGHT_WARNING_M: 3.0,
    WAVE_HEIGHT_DANGER_M: 5.0,
    WIND_SPEED_WARNING_MS: 10.0,  // ~20 knots
    WIND_SPEED_DANGER_MS: 15.0,   // ~30 knots
    SWELL_HEIGHT_WARNING_M: 2.5,
  },

  /** Coordinate validation */
  COORDINATES: {
    MIN_LATITUDE: -90,
    MAX_LATITUDE: 90,
    MIN_LONGITUDE: -180,
    MAX_LONGITUDE: 180,
  },

  /** Data quality thresholds */
  DATA_QUALITY: {
    MIN_VISIBILITY_M: 0,
    MAX_VISIBILITY_M: 100000,
    MIN_PRESSURE_HPA: 870,
    MAX_PRESSURE_HPA: 1085,
    MIN_TEMPERATURE_C: -50,
    MAX_TEMPERATURE_C: 60,
  },
} as const;

// ==================== ERROR MESSAGES ====================
export const ERROR_MESSAGES = {
  NETWORK: 'Network connection failed. Please check your internet connection.',
  TIMEOUT: 'Request timed out. Please try again.',
  RATE_LIMIT: 'Too many requests. Please wait a moment and try again.',
  GEOLOCATION_DENIED: 'Location access denied. Please enable location services.',
  GEOLOCATION_UNAVAILABLE: 'Location information is unavailable.',
  GEOLOCATION_TIMEOUT: 'Location request timed out.',
  API_ERROR: 'Failed to fetch weather data. Please try again later.',
  CACHE_ERROR: 'Cache operation failed.',
  INVALID_COORDINATES: 'Invalid coordinates provided.',
  GENERIC: 'An unexpected error occurred. Please try again.',
} as const;

// ==================== TYPE EXPORTS ====================
export type ApiEndpoint = keyof typeof API_ENDPOINTS;
export type CacheTTLType = keyof typeof CACHE_CONFIG.TTL;
export type ErrorMessageType = keyof typeof ERROR_MESSAGES;
