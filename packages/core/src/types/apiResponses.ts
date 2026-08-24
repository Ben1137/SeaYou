/**
 * COMPREHENSIVE API RESPONSE TYPE DEFINITIONS FOR SEAYOU PROJECT
 *
 * This file contains strict TypeScript interfaces for all external API responses:
 * - Open-Meteo Marine API (marine weather data)
 * - Open-Meteo Forecast API (atmospheric data)
 * - Open-Meteo Geocoding API (location search)
 * - Open-Meteo Reverse Geocoding API (lat/lng to location)
 * - Overpass API (OpenStreetMap data for marinas/coasts)
 * - Nominatim API (OpenStreetMap geocoding)
 */

// ============================================
// OPEN-METEO MARINE API
// ============================================

/**
 * 15-minute interval data from Marine API
 * Available for ocean currents with higher temporal resolution
 */
export interface MarineApiMinutely15 {
  time: string[];
  /** Ocean current velocity in m/s - 15-minute resolution */
  ocean_current_velocity?: number[];
  /** Ocean current direction in degrees - 15-minute resolution */
  ocean_current_direction?: number[];
}

export interface MarineApiHourly {
  time: string[];
  wave_height?: number[];
  wave_direction?: number[];
  wave_period?: number[];
  wave_peak_period?: number[];
  swell_wave_height?: number[];
  swell_wave_direction?: number[];
  swell_wave_period?: number[];
  swell_wave_peak_period?: number[];
  sea_surface_temperature?: number[];
  ocean_current_velocity?: number[];
  ocean_current_direction?: number[];
  wind_wave_height?: number[];
  wind_wave_direction?: number[];
  wind_wave_period?: number[];
  wind_wave_peak_period?: number[];
  /** Sea level height (mean sea level) - useful for tidal data */
  sea_level_height_msl?: number[];
  /** Secondary swell components (available from some models) */
  secondary_swell_wave_height?: number[];
  secondary_swell_wave_direction?: number[];
  secondary_swell_wave_period?: number[];
}

export interface MarineApiDaily {
  time: string[];
  wave_height_max?: number[];
  wave_period_max?: number[];
  swell_wave_height_max?: number[];
  swell_wave_direction_dominant?: number[];
}

export interface MarineApiCurrent {
  time?: string;
  interval?: number;
  sea_surface_temperature?: number;
  wave_height?: number;
  wave_period?: number;
  wave_peak_period?: number;
  wave_direction?: number;
  swell_wave_height?: number;
  swell_wave_direction?: number;
  swell_wave_period?: number;
  swell_wave_peak_period?: number;
  /** Secondary swell partition (model-dependent; nullable) */
  secondary_swell_wave_height?: number;
  secondary_swell_wave_direction?: number;
  secondary_swell_wave_period?: number;
  ocean_current_velocity?: number;
  ocean_current_direction?: number;
  wind_wave_height?: number;
  wind_wave_direction?: number;
  wind_wave_period?: number;
  wind_wave_peak_period?: number;
  /** Sea level height (mean sea level) - useful for tidal data */
  sea_level_height_msl?: number;
}

export interface MarineApiHourlyUnits {
  time?: string;
  wave_height?: string;
  wave_direction?: string;
  wave_period?: string;
  swell_wave_height?: string;
  swell_wave_direction?: string;
  swell_wave_period?: string;
  sea_surface_temperature?: string;
  ocean_current_velocity?: string;
  ocean_current_direction?: string;
  wind_wave_height?: string;
  wind_wave_direction?: string;
  wind_wave_period?: string;
}

export interface MarineApiDailyUnits {
  time?: string;
  wave_height_max?: string;
  wave_period_max?: string;
  swell_wave_height_max?: string;
  swell_wave_direction_dominant?: string;
}

export interface MarineApiResponse {
  latitude: number;
  longitude: number;
  generationtime_ms?: number;
  utc_offset_seconds?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  elevation?: number;
  hourly_units?: MarineApiHourlyUnits;
  daily_units?: MarineApiDailyUnits;
  /** 15-minute interval data for ocean currents */
  minutely_15?: MarineApiMinutely15;
  minutely_15_units?: {
    time?: string;
    ocean_current_velocity?: string;
    ocean_current_direction?: string;
  };
  hourly?: MarineApiHourly;
  daily?: MarineApiDaily;
  current?: MarineApiCurrent;
}

// ============================================
// OPEN-METEO FORECAST API
// ============================================

export interface ForecastApiHourly {
  time: string[];
  temperature_2m?: number[];
  relative_humidity_2m?: number[];
  apparent_temperature?: number[];
  precipitation?: number[];
  precipitation_probability?: number[];
  weather_code?: number[];
  pressure_msl?: number[];
  surface_pressure?: number[];
  cloud_cover?: number[];
  visibility?: number[];
  wind_speed_10m?: number[];
  wind_direction_10m?: number[];
  wind_gusts_10m?: number[];
  uv_index?: number[];
  is_day?: number[];
}

export interface ForecastApiDaily {
  time: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  apparent_temperature_max?: number[];
  apparent_temperature_min?: number[];
  sunrise?: string[];
  sunset?: string[];
  uv_index_max?: number[];
  precipitation_sum?: number[];
  precipitation_hours?: number[];
  precipitation_probability_max?: number[];
  wind_speed_10m_max?: number[];
  wind_gusts_10m_max?: number[];
  wind_direction_10m_dominant?: number[];
}

export interface ForecastApiCurrent {
  time?: string;
  interval?: number;
  temperature_2m?: number;
  relative_humidity_2m?: number;
  apparent_temperature?: number;
  is_day?: number;
  precipitation?: number;
  weather_code?: number;
  cloud_cover?: number;
  pressure_msl?: number;
  surface_pressure?: number;
  wind_speed_10m?: number;
  wind_direction_10m?: number;
  wind_gusts_10m?: number;
  visibility?: number;
}

export interface ForecastApiHourlyUnits {
  time?: string;
  temperature_2m?: string;
  relative_humidity_2m?: string;
  apparent_temperature?: string;
  precipitation?: string;
  weather_code?: string;
  pressure_msl?: string;
  surface_pressure?: string;
  cloud_cover?: string;
  visibility?: string;
  wind_speed_10m?: string;
  wind_direction_10m?: string;
  wind_gusts_10m?: string;
  uv_index?: string;
  is_day?: string;
}

export interface ForecastApiDailyUnits {
  time?: string;
  weather_code?: string;
  temperature_2m_max?: string;
  temperature_2m_min?: string;
  apparent_temperature_max?: string;
  apparent_temperature_min?: string;
  sunrise?: string;
  sunset?: string;
  uv_index_max?: string;
  precipitation_sum?: string;
  precipitation_hours?: string;
  wind_speed_10m_max?: string;
  wind_gusts_10m_max?: string;
  wind_direction_10m_dominant?: string;
}

export interface ForecastApiResponse {
  latitude: number;
  longitude: number;
  generationtime_ms?: number;
  utc_offset_seconds?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  elevation?: number;
  current_units?: Record<string, string>;
  hourly_units?: ForecastApiHourlyUnits;
  daily_units?: ForecastApiDailyUnits;
  current?: ForecastApiCurrent;
  hourly?: ForecastApiHourly;
  daily?: ForecastApiDaily;
}

// ============================================
// OPEN-METEO GEOCODING API
// ============================================

export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  feature_code?: string;
  country_code?: string;
  admin1_id?: number;
  admin2_id?: number;
  admin3_id?: number;
  admin4_id?: number;
  timezone?: string;
  population?: number;
  postcodes?: string[];
  country_id?: number;
  country?: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
  admin4?: string;
}

export interface GeocodingApiResponse {
  results?: GeocodingResult[];
  generationtime_ms?: number;
}

// ============================================
// OPEN-METEO REVERSE GEOCODING API
// ============================================

export interface ReverseGeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  feature_code?: string;
  country_code?: string;
  admin1_id?: number;
  admin2_id?: number;
  admin3_id?: number;
  admin4_id?: number;
  timezone?: string;
  population?: number;
  country_id?: number;
  country?: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
  admin4?: string;
}

export interface ReverseGeocodingApiResponse {
  results?: ReverseGeocodingResult[];
  generationtime_ms?: number;
}

// ============================================
// OVERPASS API (OpenStreetMap)
// ============================================

export interface OverpassNodeElement {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface OverpassWayElement {
  type: 'way';
  id: number;
  center?: {
    lat: number;
    lon: number;
  };
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

export interface OverpassRelationElement {
  type: 'relation';
  id: number;
  center?: {
    lat: number;
    lon: number;
  };
  members?: Array<{
    type: 'node' | 'way' | 'relation';
    ref: number;
    role: string;
  }>;
  tags?: Record<string, string>;
}

export type OverpassElement = OverpassNodeElement | OverpassWayElement | OverpassRelationElement;

export interface OverpassApiResponse {
  version: number;
  generator: string;
  osm3s?: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OverpassElement[];
}

// ============================================
// NOMINATIM API (OpenStreetMap Geocoding)
// ============================================

export interface NominatimAddress {
  house_number?: string;
  road?: string;
  suburb?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
  neighbourhood?: string;
  town?: string;
  village?: string;
  municipality?: string;
  region?: string;
  state_district?: string;
}

export interface NominatimSearchResult {
  place_id: number;
  licence: string;
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  boundingbox: [string, string, string, string]; // [min_lat, max_lat, min_lon, max_lon]
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  icon?: string;
  address?: NominatimAddress;
  extratags?: Record<string, string>;
  namedetails?: Record<string, string>;
}

export type NominatimApiResponse = NominatimSearchResult[];

// ============================================
// BULK API RESPONSES (Array variants)
// ============================================

/**
 * When querying multiple coordinates, Open-Meteo returns an array of responses
 * instead of a single response object
 */
export type MarineApiBulkResponse = MarineApiResponse[];
export type ForecastApiBulkResponse = ForecastApiResponse[];
