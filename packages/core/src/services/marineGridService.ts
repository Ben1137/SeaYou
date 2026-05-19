/**
 * Marine Grid Service
 *
 * Fetches grid-based marine data from Open-Meteo Marine API for bounding boxes.
 * Provides data in formats suitable for:
 * - leaflet-velocity (wind and ocean currents visualization)
 * - Heatmaps (wave height visualization)
 *
 * Grid data allows visualization of marine conditions across an area rather than
 * at a single point, enabling interactive maps with vector fields and heatmaps.
 */

import { API_ENDPOINTS, WEATHER_CONSTANTS, REQUEST_CONFIG } from '../constants';
import { deduplicatedFetch } from '../utils/requestDeduplication';
import {
  getPrimaryWeatherModel,
  getPrimaryMarineModel,
  getOptimalModels,
  getModelForLocation as _getModelForLocation
} from '../utils/openMeteoConfig';
import { globalRateLimiter } from './apiRateLimiter';

/**
 * Maximum coordinates per model before hitting API limits
 * dwd_ewam has stricter limits than global models
 */
const MAX_COORDINATES_BY_MODEL: Record<string, number> = {
  'dwd_ewam': 100,      // European model has stricter limits (~100 safe)
  'ecmwf_wam': 256,     // Global wave model, larger limit
  'best_match': 256,    // Auto-select, safe default
  'default': 256        // Fallback
};

function getModelForLocation(lat: number, lng: number, isMarine: boolean = false): string {
  return _getModelForLocation(lat, lng, isMarine, WEATHER_CONSTANTS.PREFER_HIGH_RESOLUTION, WEATHER_CONSTANTS.MODEL);
}

/**
 * Get fallback model when primary model fails
 * Returns 'best_match' as universal fallback
 */
function getFallbackModel(currentModel: string): string {
  // If already using best_match, there's no fallback
  if (currentModel === 'best_match') {
    return '';
  }
  // For regional models, fall back to best_match
  return 'best_match';
}

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Bounding box coordinates for grid data
 */
export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Grid resolution configuration
 * Controls the density of data points in the grid
 */
export interface GridResolution {
  /** Number of latitude points */
  latPoints: number;
  /** Number of longitude points */
  lngPoints: number;
}

/**
 * Raw grid data response from Open-Meteo Marine API
 * Using bulk coordinate requests to simulate grid coverage
 */
export interface MarineGridData {
  /** Grid metadata */
  bounds: BoundingBox;
  resolution: GridResolution;
  timestamp: string;

  /** Grid points data */
  points: MarineGridPoint[];
}

/**
 * Single point in the marine data grid
 */
export interface MarineGridPoint {
  lat: number;
  lng: number;

  // Wind data
  windSpeed?: number;      // m/s
  windDirection?: number;  // degrees
  windGusts?: number;      // m/s - wind gusts
  windU?: number;         // U component (east-west)
  windV?: number;         // V component (north-south)

  // Ocean current data
  currentSpeed?: number;      // m/s
  currentDirection?: number;  // degrees
  currentU?: number;         // U component
  currentV?: number;         // V component

  // Wave data (significant wave = combination of wind waves + swell)
  waveHeight?: number;        // meters - significant wave height
  waveDirection?: number;     // degrees
  wavePeriod?: number;        // seconds - mean wave period
  wavePeakPeriod?: number;    // seconds - peak wave period (most energy)
  waveU?: number;             // U component (east-west) — derived from waveHeight × direction
  waveV?: number;             // V component (north-south) — derived from waveHeight × direction

  // Swell data (long-period waves from distant storms)
  swellHeight?: number;       // meters
  swellDirection?: number;    // degrees
  swellPeriod?: number;       // seconds

  // Wind wave data (locally generated waves)
  windWaveHeight?: number;    // meters
  windWaveDirection?: number; // degrees
  windWavePeriod?: number;    // seconds

  // Sea level and temperature
  seaLevelHeight?: number;    // meters - sea level height MSL (tidal)
  seaTemperature?: number;    // Celsius — undefined for land coordinates

  /**
   * True when Open-Meteo returned valid marine data for this coordinate.
   * The marine API returns null for all marine variables at land coordinates
   * (cell_selection:'sea'). Used by layer components to preserve null vs zero
   * so the DataEncoder can set alpha=0, triggering shader discard on land.
   */
  isOcean?: boolean;
}

/**
 * Leaflet-velocity compatible JSON format
 * Based on: https://github.com/onaci/leaflet-velocity
 *
 * Data format follows GRIB2 conventions:
 * - Grid scans from NORTH to SOUTH (la1 > la2)
 * - Grid scans from WEST to EAST (lo1 < lo2)
 * - Data array is in row-major order: (lat0,lon0), (lat0,lon1), ..., (lat1,lon0), ...
 */
export interface VelocityData {
  /** Header describing the data */
  header: {
    /** Grid type identifier */
    parameterCategory: number;
    parameterNumber: number;
    /** Grid dimensions */
    nx: number;  // longitude points (columns)
    ny: number;  // latitude points (rows)
    /** Grid bounds (GRIB2 format) */
    lo1: number; // first longitude (west)
    la1: number; // first latitude (north) - grid starts from north
    lo2: number; // last longitude (east)
    la2: number; // last latitude (south) - grid ends at south
    /** Grid spacing */
    dx: number;  // longitude delta (degrees per point)
    dy: number;  // latitude delta (degrees per point)
    /** Velocity component (U or V) */
    parameterNumberName: string;
    /** Reference time (ISO 8601 string) */
    refTime?: string;
    /** Forecast time offset in hours */
    forecastTime?: number;
    /**
     * Grid definition template (GRIB2 Section 3)
     * Must be 0 for latitude-longitude grids (only supported type)
     * @see https://github.com/onaci/leaflet-velocity
     */
    gridDefinitionTemplate?: number;
    /**
     * Scan mode - 8-bit mask controlling grid direction
     * Bit 7 (128): 0 = points scan +i (+x) direction (west to east)
     * Bit 6 (64):  0 = points scan -j (-y) direction (north to south)
     * Default: 0 (scan west→east, north→south) which matches our data ordering
     * @see https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table3-4.shtml
     */
    scanMode?: number;
  };
  /** Flattened grid data array [row-major order from NW corner] */
  data: number[];
}

/**
 * Complete velocity field with U and V components
 * Format: Array [U, V] for leaflet-velocity compatibility
 */
export interface VelocityField {
  wind?: [VelocityData, VelocityData];
  current?: [VelocityData, VelocityData];
}

/**
 * Grid cell for heatmap visualization
 */
export interface GridCell {
  lat: number;
  lng: number;
  value: number;
  /** Color code for the cell */
  color: string;
  /** Normalized intensity [0-1] for color mapping */
  intensity?: number;
  /** Wave direction in degrees (0-360, meteorological convention) */
  direction?: number;
}

/**
 * Wave grid data for heatmap
 */
export interface WaveGrid {
  cells: GridCell[];
  bounds: BoundingBox;
  resolution: GridResolution;
  /** Statistics for normalization */
  stats: {
    min: number;
    max: number;
    mean: number;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate grid coordinates within a bounding box
 *
 * IMPORTANT: For leaflet-velocity compatibility, grid points must be ordered
 * from NORTH to SOUTH (top to bottom), then WEST to EAST (left to right).
 * This matches the GRIB2 data format that leaflet-velocity expects.
 */
function generateGridCoordinates(bounds: BoundingBox, resolution: GridResolution): { lat: number; lng: number }[] {
  const { north, south, east, west } = bounds;
  const { latPoints, lngPoints } = resolution;

  const latStep = (north - south) / (latPoints - 1);
  const lngStep = (east - west) / (lngPoints - 1);

  const coordinates: { lat: number; lng: number }[] = [];

  // Generate from NORTH to SOUTH (top to bottom) for GRIB2/leaflet-velocity compatibility
  for (let i = 0; i < latPoints; i++) {
    for (let j = 0; j < lngPoints; j++) {
      const lat = north - (i * latStep);  // Start from north, go south
      const lng = west + (j * lngStep);   // Start from west, go east
      coordinates.push({ lat, lng });
    }
  }

  return coordinates;
}

/**
 * Convert wind/current direction and speed to U/V components
 * @param speed - Speed in m/s
 * @param direction - Direction in degrees (meteorological convention: direction FROM which wind/current is coming)
 * @returns U (east-west) and V (north-south) components
 */
function directionSpeedToUV(speed: number, direction: number): { u: number; v: number } {
  // Convert meteorological direction to mathematical angle
  // Meteorological: 0° = North, 90° = East, 180° = South, 270° = West (clockwise from North)
  // Mathematical: 0° = East, 90° = North, 180° = West, 270° = South (counter-clockwise from East)
  // Also, meteorological direction is "FROM", so we need to add 180° to get "TO" direction

  const mathAngle = (270 - direction) % 360;
  const radians = (mathAngle * Math.PI) / 180;

  const u = speed * Math.cos(radians);
  const v = speed * Math.sin(radians);

  return { u, v };
}

/**
 * Calculate statistics for grid values
 */
function calculateStats(values: number[]): { min: number; max: number; mean: number } {
  const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));

  if (validValues.length === 0) {
    return { min: 0, max: 0, mean: 0 };
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const mean = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;

  return { min, max, mean };
}

/**
 * Normalize value to [0-1] range for intensity mapping
 */
function normalizeValue(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

/**
 * Get color for wave height (matching colorScales.ts wave scale)
 * Wave scale: 0-5m from light blue to magenta
 */
function getWaveHeightColor(height: number): string {
  const clampedHeight = Math.max(0, Math.min(5, height));

  if (clampedHeight < 0.5) return '#93c5fd'; // Blue-300
  if (clampedHeight < 1.0) return '#3b82f6'; // Blue-500
  if (clampedHeight < 1.5) return '#2563eb'; // Blue-600
  if (clampedHeight < 2.0) return '#1e40af'; // Blue-700
  if (clampedHeight < 2.5) return '#6366f1'; // Indigo-500
  if (clampedHeight < 3.0) return '#8b5cf6'; // Violet-500
  if (clampedHeight < 3.5) return '#a855f7'; // Purple-500
  if (clampedHeight < 4.0) return '#c026d3'; // Fuchsia-600
  return '#e879f9'; // Fuchsia-400
}

// ============================================
// MAIN API FUNCTIONS
// ============================================

/**
 * Fetch grid-based marine data for a bounding box
 *
 * @param bounds - Bounding box coordinates
 * @param resolution - Grid resolution (number of points)
 * @returns Marine grid data with wind, waves, and currents
 */
export async function fetchMarineGridData(
  bounds: BoundingBox,
  resolution: GridResolution = { latPoints: 5, lngPoints: 5 },
  userModel?: string
): Promise<MarineGridData> {
  try {
    // URL length budget: each "lat,lng" pair consumes ~14 chars in the query string.
    // At 200 points that's ~2800 chars of coordinate data. With the rest of the URL
    // (endpoint + params), total stays well under 8000 chars (modern browser limit).
    // Open-Meteo itself supports up to ~256+ coordinates per request with no issues.
    // Previous cap of 64 was artificially destroying wind-field resolution — removed.
    const maxPoints = REQUEST_CONFIG.GRID_LIMITS?.MAX_TOTAL_GRID_POINTS ?? 256;
    const maxPerAxis = Math.floor(Math.sqrt(maxPoints));
    const clampedResolution: GridResolution = {
      latPoints: Math.min(resolution.latPoints, maxPerAxis),
      lngPoints: Math.min(resolution.lngPoints, maxPerAxis),
    };

    // Generate grid coordinates
    const coordinates = generateGridCoordinates(bounds, clampedResolution);
    let coordinateCount = coordinates.length;

    // Hard ceiling: never exceed 200 coordinates per request.
    // This keeps URLs under ~5500 chars even on slow connections, while still
    // allowing up to a 14x14 = 196-point grid (vs. the old crippling 64-point cap).
    const maxCoordinatesPerRequest = Math.min(
      REQUEST_CONFIG.GRID_LIMITS?.MAX_COORDINATES_PER_REQUEST ?? 256,
      200
    );
    if (coordinateCount > maxCoordinatesPerRequest) {
      console.warn(`[MarineGridService] Grid has ${coordinateCount} points, capping to ${maxCoordinatesPerRequest} (URL budget)`);
      coordinates.length = maxCoordinatesPerRequest;
      coordinateCount = coordinates.length;
    } else {
      console.log(`[MarineGridService] Grid using ${coordinateCount} points (ceiling: ${maxCoordinatesPerRequest})`);
    }

    // Open-Meteo supports comma-separated lists for bulk queries
    const lats = coordinates.map(c => c.lat.toFixed(4)).join(',');
    const lngs = coordinates.map(c => c.lng.toFixed(4)).join(',');

    // Calculate center of bounding box for model selection
    const centerLat = (bounds.north + bounds.south) / 2;
    const centerLng = (bounds.east + bounds.west) / 2;

    // Get optimal models for this region based on geolocation (userModel overrides when set)
    let marineModel = userModel ?? getModelForLocation(centerLat, centerLng, true);
    const weatherModel = userModel ?? getModelForLocation(centerLat, centerLng, false);

    // Check if coordinate count exceeds model limit - auto-fallback to best_match
    const maxCoords = MAX_COORDINATES_BY_MODEL[marineModel] || MAX_COORDINATES_BY_MODEL['default'];
    if (coordinateCount > maxCoords) {
      console.warn(`[MarineGridService] ${coordinateCount} coordinates exceeds ${marineModel} limit (${maxCoords}), falling back to best_match`);
      marineModel = 'best_match';
    }

    // Log model selection for debugging
    if (WEATHER_CONSTANTS.PREFER_HIGH_RESOLUTION) {
      const selection = getOptimalModels(centerLat, centerLng);
      console.log(`[MarineGridService] Region: ${selection.region} | Marine: ${marineModel} | Weather: ${weatherModel} | Resolution: ~${selection.recommendedResolutionKm}km | Coords: ${coordinateCount}`);
    }

    // Helper function to fetch marine data with fallback
    const fetchMarineWithFallback = async (model: string): Promise<any> => {
      const marineParams = new URLSearchParams({
        latitude: lats,
        longitude: lngs,
        current: [
          // Significant wave data (combined wind waves + swell)
          'wave_height', 'wave_direction', 'wave_period', 'wave_peak_period',
          // Swell data (long-period waves from distant storms)
          'swell_wave_height', 'swell_wave_direction', 'swell_wave_period',
          // Wind wave data (locally generated waves)
          'wind_wave_height', 'wind_wave_direction', 'wind_wave_period',
          // Ocean currents
          'ocean_current_velocity', 'ocean_current_direction',
          // Sea temperature and level
          'sea_surface_temperature', 'sea_level_height_msl'
        ].join(','),
        timezone: WEATHER_CONSTANTS.TIMEZONE,
        models: model,
        cell_selection: WEATHER_CONSTANTS.MARINE_CELL_SELECTION
      });

      try {
        return await deduplicatedFetch<any>(
          `${API_ENDPOINTS.MARINE}?${marineParams.toString()}`,
          undefined,
          { ttl: 300000 }
        );
      } catch (error: any) {
        // If this model failed with 400 and we have a fallback, try it
        if (error?.message?.includes('400') || error?.status === 400) {
          const fallback = getFallbackModel(model);
          if (fallback) {
            console.warn(`[MarineGridService] ${model} failed with 400, trying fallback: ${fallback}`);
            marineParams.set('models', fallback);
            return await deduplicatedFetch<any>(
              `${API_ENDPOINTS.MARINE}?${marineParams.toString()}`,
              undefined,
              { ttl: 300000 }
            );
          }
        }
        throw error;
      }
    };

    // Fetch atmospheric data (wind) from forecast API
    // Best Practice: Use cell_selection: 'land' for wind data accuracy
    const forecastParams = new URLSearchParams({
      latitude: lats,
      longitude: lngs,
      current: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      timezone: WEATHER_CONSTANTS.TIMEZONE,
      models: weatherModel,
      cell_selection: WEATHER_CONSTANTS.LAND_CELL_SELECTION
    });

    // Use deduplicatedFetch + global rate limiter to prevent duplicate API calls and 429 errors
    // The global rate limiter ensures ALL API requests (across all layers) are serialized
    let marineResponses: any;
    let forecastResponses: any;

    try {
      // Wrap both API calls in the global rate limiter queue
      // They will execute sequentially with proper spacing to prevent 429
      marineResponses = await globalRateLimiter.enqueue(() =>
        fetchMarineWithFallback(marineModel)
      );

      forecastResponses = await globalRateLimiter.enqueue(() =>
        deduplicatedFetch<any>(`${API_ENDPOINTS.FORECAST}?${forecastParams.toString()}`, undefined, { ttl: 300000 })
      );
    } catch (error: any) {
      // Error handling is done inside the rate limiter, but we still need to propagate
      throw error;
    }

    // Open-Meteo returns an array for multiple coordinates, or single object for one coordinate
    const marineArray = Array.isArray(marineResponses) ? marineResponses : [marineResponses];
    const forecastArray = Array.isArray(forecastResponses) ? forecastResponses : [forecastResponses];

    // Process each grid point
    const points: MarineGridPoint[] = marineArray.map((marine, index) => {
      const forecast = forecastArray[index] || {};
      const coord = coordinates[index];

      // Wind data from forecast API (atmospheric)
      const windSpeed = forecast.current?.wind_speed_10m || 0;
      const windDirection = forecast.current?.wind_direction_10m || 0;
      const windGusts = forecast.current?.wind_gusts_10m || 0;
      const windUV = directionSpeedToUV(windSpeed, windDirection);

      // Ocean current data from marine API
      const currentSpeed = marine.current?.ocean_current_velocity || 0;
      const currentDirection = marine.current?.ocean_current_direction || 0;
      const currentUV = directionSpeedToUV(currentSpeed, currentDirection);

      // Wave UV — uses waveHeight as magnitude, waveDirection as FROM direction
      // (Open-Meteo wave_direction is "direction waves are coming FROM", same convention as wind)
      const waveH = marine.current?.wave_height || 0;
      const waveDir = marine.current?.wave_direction || 0;
      const waveUV = directionSpeedToUV(waveH, waveDir);

      // Determine if this coordinate is ocean.
      // Open-Meteo marine API returns null for ALL marine variables at land coordinates
      // when using cell_selection:'sea'. sea_surface_temperature is the most reliable
      // discriminator because it is never 0°C for valid sea data in tropical/temperate regions.
      const rawSeaTemp = marine.current?.sea_surface_temperature;
      const isOcean = rawSeaTemp !== null && rawSeaTemp !== undefined;

      return {
        lat: coord.lat,
        lng: coord.lng,

        // Wind (from Forecast API with cell_selection: 'land')
        windSpeed,
        windDirection,
        windGusts,
        windU: windUV.u,
        windV: windUV.v,

        // Ocean Currents (from Marine API with cell_selection: 'sea')
        currentSpeed,
        currentDirection,
        currentU: currentUV.u,
        currentV: currentUV.v,

        // Significant Wave (combined wind waves + swell)
        waveHeight: waveH,
        waveDirection: waveDir,
        waveU: waveUV.u,
        waveV: waveUV.v,
        wavePeriod: marine.current?.wave_period || 0,
        wavePeakPeriod: marine.current?.wave_peak_period || 0,

        // Swell (long-period waves from distant storms)
        swellHeight: marine.current?.swell_wave_height || 0,
        swellDirection: marine.current?.swell_wave_direction || 0,
        swellPeriod: marine.current?.swell_wave_period || 0,

        // Wind Waves (locally generated)
        windWaveHeight: marine.current?.wind_wave_height || 0,
        windWaveDirection: marine.current?.wind_wave_direction || 0,
        windWavePeriod: marine.current?.wind_wave_period || 0,

        // Sea Level & Temperature
        seaLevelHeight: marine.current?.sea_level_height_msl || 0,
        // seaTemperature stays undefined for land coordinates (do NOT use || 0)
        // so DataEncoder can set alpha=0 and shaders can discard land pixels.
        seaTemperature: isOcean ? rawSeaTemp! : undefined,

        isOcean,
      };
    });

    return {
      bounds,
      resolution,
      timestamp: new Date().toISOString(),
      points
    };

  } catch (error) {
    console.error('Failed to fetch marine grid data:', error);
    throw error;
  }
}

/**
 * Convert marine grid data to leaflet-velocity format
 *
 * @param gridData - Marine grid data
 * @param type - Type of velocity data ('wind' or 'current')
 * @returns Velocity field with U and V components
 */
export function convertToVelocityFormat(
  gridData: MarineGridData,
  type: 'wind' | 'current' = 'wind'
): VelocityField {
  const { bounds, resolution, points } = gridData;
  const { latPoints, lngPoints } = resolution;

  // Calculate grid spacing
  const dx = (bounds.east - bounds.west) / (lngPoints - 1);
  const dy = (bounds.north - bounds.south) / (latPoints - 1);

  // Extract U and V components based on type
  const uData: number[] = new Array(points.length);
  const vData: number[] = new Array(points.length);

  points.forEach((point, index) => {
    if (type === 'wind') {
      uData[index] = point.windU || 0;
      vData[index] = point.windV || 0;
    } else if (type === 'current') {
      uData[index] = point.currentU || 0;
      vData[index] = point.currentV || 0;
    }
  });

  // Create velocity data header (following GRIB2 format conventions)
  // IMPORTANT: In GRIB2 format used by leaflet-velocity:
  // - la1 = first latitude in data (NORTH, since we scan from north to south)
  // - la2 = last latitude in data (SOUTH)
  // - lo1 = first longitude in data (WEST)
  // - lo2 = last longitude in data (EAST)
  const createHeader = (componentName: string, paramNumber: number): VelocityData['header'] => ({
    parameterCategory: 2, // Momentum
    parameterNumber: paramNumber, // U-component: 2, V-component: 3
    nx: lngPoints,
    ny: latPoints,
    lo1: bounds.west,   // First longitude (west)
    la1: bounds.north,  // First latitude (north) - grid starts from north
    lo2: bounds.east,   // Last longitude (east)
    la2: bounds.south,  // Last latitude (south) - grid ends at south
    dx,
    dy,
    parameterNumberName: componentName,
    refTime: new Date().toISOString(), // Reference time for leaflet-velocity
    forecastTime: 0, // Forecast offset in hours
    // Best practice fields for leaflet-velocity compatibility:
    gridDefinitionTemplate: 0, // 0 = latitude-longitude grid (only supported type)
    scanMode: 0, // 0 = scan west→east (bit 7=0), north→south (bit 6=0)
  });

  // Create velocity data in leaflet-velocity array format [U, V]
  const velocityData: any = [
    {
      header: createHeader(type === 'wind' ? 'U-component_of_wind' : 'U-component_of_current', 2),
      data: uData
    },
    {
      header: createHeader(type === 'wind' ? 'V-component_of_wind' : 'V-component_of_current', 3),
      data: vData
    }
  ];

  const result: VelocityField = {};

  if (type === 'wind') {
    result.wind = velocityData;
  } else if (type === 'current') {
    result.current = velocityData;
  }

  return result;
}

/**
 * Generate grid cells for wave height heatmap
 *
 * @param gridData - Marine grid data
 * @param waveType - Type of wave data ('wave' or 'swell')
 * @returns Wave grid with cells and statistics
 */
export function generateWaveGridCells(
  gridData: MarineGridData,
  waveType: 'wave' | 'swell' = 'wave'
): WaveGrid {
  const { points, bounds, resolution } = gridData;

  // Extract wave heights
  const values = points.map(p =>
    waveType === 'wave' ? (p.waveHeight || 0) : (p.swellHeight || 0)
  );

  // Calculate statistics
  const stats = calculateStats(values);

  // Create grid cells with color, normalized intensity, and direction
  const cells: GridCell[] = points.map((point, index) => {
    const value = values[index];
    const direction = waveType === 'wave' ? point.waveDirection : point.swellDirection;

    return {
      lat: point.lat,
      lng: point.lng,
      value,
      color: getWaveHeightColor(value),
      intensity: normalizeValue(value, stats.min, stats.max),
      direction: direction !== undefined && direction !== null ? direction : undefined
    };
  });

  return {
    cells,
    bounds,
    resolution,
    stats
  };
}

/**
 * Fetch combined velocity field (wind + currents)
 *
 * Convenience function to get both wind and current velocity data in one call
 *
 * @param bounds - Bounding box coordinates
 * @param resolution - Grid resolution
 * @returns Combined velocity field
 */
export async function fetchVelocityField(
  bounds: BoundingBox,
  resolution: GridResolution = { latPoints: 5, lngPoints: 5 },
  userModel?: string
): Promise<{ wind: VelocityField; current: VelocityField }> {
  const gridData = await fetchMarineGridData(bounds, resolution, userModel);

  return {
    wind: convertToVelocityFormat(gridData, 'wind'),
    current: convertToVelocityFormat(gridData, 'current')
  };
}

/**
 * Fetch wave heatmap data
 *
 * Convenience function to get wave grid cells ready for heatmap visualization
 *
 * @param bounds - Bounding box coordinates
 * @param resolution - Grid resolution
 * @param waveType - Type of wave data
 * @returns Wave grid for heatmap
 */
export async function fetchWaveHeatmap(
  bounds: BoundingBox,
  resolution: GridResolution = { latPoints: 5, lngPoints: 5 },
  waveType: 'wave' | 'swell' = 'wave',
  userModel?: string
): Promise<WaveGrid> {
  const gridData = await fetchMarineGridData(bounds, resolution, userModel);
  return generateWaveGridCells(gridData, waveType);
}
