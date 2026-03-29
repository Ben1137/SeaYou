/**
 * Forecast Grid Service
 *
 * Fetches grid-based atmospheric data from Open-Meteo Forecast API for bounding boxes.
 * Provides: temperature_2m, pressure_msl, cloud_cover, precipitation
 *
 * Follows the same bulk-coordinate pattern as marineGridService.ts.
 * These variables are valid everywhere (land + ocean), so no cell_selection needed.
 */

import { API_ENDPOINTS, WEATHER_CONSTANTS } from '../constants';
import { deduplicatedFetch } from '../utils/requestDeduplication';
import { getPrimaryWeatherModel } from '../utils/openMeteoConfig';
import type { BoundingBox, GridResolution } from './marineGridService';

export interface ForecastGridPoint {
  lat: number;
  lng: number;
  temperature2m?: number;      // Celsius
  pressureMsl?: number;        // hPa
  cloudCover?: number;         // 0-100 (percentage)
  precipitation?: number;      // mm/h
  windSpeed?: number;          // m/s (10m above ground)
  windDirection?: number;      // degrees (meteorological: FROM direction)
  windU?: number;              // U component (east-west) m/s
  windV?: number;              // V component (north-south) m/s
}

export interface ForecastGridData {
  bounds: BoundingBox;
  resolution: GridResolution;
  timestamp: string;
  points: ForecastGridPoint[];
}

/**
 * Generate grid coordinates within a bounding box.
 * Ordered from NORTH to SOUTH, then WEST to EAST.
 */
function generateGridCoordinates(bounds: BoundingBox, resolution: GridResolution): { lat: number; lng: number }[] {
  const { north, south, east, west } = bounds;
  const { latPoints, lngPoints } = resolution;

  const latStep = (north - south) / (latPoints - 1);
  const lngStep = (east - west) / (lngPoints - 1);

  const coordinates: { lat: number; lng: number }[] = [];

  for (let i = 0; i < latPoints; i++) {
    for (let j = 0; j < lngPoints; j++) {
      const lat = north - (i * latStep);
      const lng = west + (j * lngStep);
      coordinates.push({ lat, lng });
    }
  }

  return coordinates;
}

/**
 * Get the optimal weather model for a given location
 */
function getModelForLocation(lat: number, lng: number): string {
  if (WEATHER_CONSTANTS.PREFER_HIGH_RESOLUTION) {
    return getPrimaryWeatherModel(lat, lng, true);
  }
  return WEATHER_CONSTANTS.MODEL;
}

/**
 * Fetch grid-based forecast data for a bounding box.
 *
 * @param bounds - Bounding box coordinates
 * @param resolution - Grid resolution (number of points)
 * @returns Forecast grid data with temperature, pressure, cloud cover, precipitation
 */
export async function fetchForecastGridData(
  bounds: BoundingBox,
  resolution: GridResolution = { latPoints: 8, lngPoints: 8 }
): Promise<ForecastGridData> {
  try {
    const coordinates = generateGridCoordinates(bounds, resolution);

    const lats = coordinates.map(c => c.lat.toFixed(4)).join(',');
    const lngs = coordinates.map(c => c.lng.toFixed(4)).join(',');

    // Calculate center of bounding box for model selection
    const centerLat = (bounds.north + bounds.south) / 2;
    const centerLng = (bounds.east + bounds.west) / 2;
    const weatherModel = getModelForLocation(centerLat, centerLng);

    const params = new URLSearchParams({
      latitude: lats,
      longitude: lngs,
      current: [
        'temperature_2m',
        'pressure_msl',
        'cloud_cover',
        'precipitation',
        'wind_speed_10m',
        'wind_direction_10m',
      ].join(','),
      timezone: WEATHER_CONSTANTS.TIMEZONE,
      models: weatherModel,
    });

    const responses = await deduplicatedFetch<any>(
      `${API_ENDPOINTS.FORECAST}?${params.toString()}`,
      undefined,
      { ttl: 3600000 } // 60 min — forecast data updates hourly at most
    );

    // Open-Meteo returns array for multiple coordinates, single object for one
    const forecastArray = Array.isArray(responses) ? responses : [responses];

    const points: ForecastGridPoint[] = forecastArray.map((forecast, index) => {
      const coord = coordinates[index];

      // Compute wind U/V from speed + direction
      const windSpeed = forecast.current?.wind_speed_10m ?? 0;
      const windDirection = forecast.current?.wind_direction_10m ?? 0;
      // Meteorological convention: direction FROM which wind blows
      // Convert to "TO" direction for U/V: add 180° then to math angle
      const mathAngle = (270 - windDirection) % 360;
      const radians = (mathAngle * Math.PI) / 180;
      const windU = windSpeed * Math.cos(radians);
      const windV = windSpeed * Math.sin(radians);

      return {
        lat: coord.lat,
        lng: coord.lng,
        temperature2m: forecast.current?.temperature_2m ?? undefined,
        pressureMsl: forecast.current?.pressure_msl ?? undefined,
        cloudCover: forecast.current?.cloud_cover ?? undefined,
        precipitation: forecast.current?.precipitation ?? undefined,
        windSpeed: windSpeed || undefined,
        windDirection: windDirection || undefined,
        windU,
        windV,
      };
    });

    return {
      bounds,
      resolution,
      timestamp: new Date().toISOString(),
      points,
    };
  } catch (error) {
    console.error('[ForecastGridService] Failed to fetch forecast grid data:', error);
    throw error;
  }
}
