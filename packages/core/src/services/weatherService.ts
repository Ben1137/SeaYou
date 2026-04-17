
import {
  MarineWeatherData,
  PointForecast,
  GeneralWeather,
  Location,
  DetailedPointForecast,
  MarineApiResponse,
  ForecastApiResponse,
  GeocodingApiResponse,
  ReverseGeocodingApiResponse
} from '../types';
import { addHours, format, startOfHour, addDays, parseISO, addMinutes } from 'date-fns';
import { generateTideData, getMoonData } from '../utils/calculations';
import { getWeatherDescription } from '../utils/formatting';
import { API_ENDPOINTS, WEATHER_CONSTANTS } from '../constants';
import { deduplicatedFetch } from '../utils/requestDeduplication';
import { globalRateLimiter } from './apiRateLimiter';
import {
  getPrimaryWeatherModel,
  getPrimaryMarineModel,
  getOptimalModels,
  getModelForLocation as _getModelForLocation
} from '../utils/openMeteoConfig';

// Local definitions removed - imported from utils

function getModelForLocation(lat: number, lng: number, isMarine: boolean = false): string {
  return _getModelForLocation(lat, lng, isMarine, WEATHER_CONSTANTS.PREFER_HIGH_RESOLUTION, WEATHER_CONSTANTS.MODEL);
}

export const fetchMarineWeather = async (lat: number, lng: number): Promise<MarineWeatherData> => {
  try {
    // Get optimal models for this location based on geolocation
    const marineModel = getModelForLocation(lat, lng, true);
    const weatherModel = getModelForLocation(lat, lng, false);

    // Log model selection for debugging (can be removed in production)
    if (WEATHER_CONSTANTS.PREFER_HIGH_RESOLUTION) {
      const selection = getOptimalModels(lat, lng);
      console.log(`[WeatherService] Location: ${lat.toFixed(2)}, ${lng.toFixed(2)} | Region: ${selection.region} | Marine: ${marineModel} | Weather: ${weatherModel} | Resolution: ~${selection.recommendedResolutionKm}km`);
    }

    // MARINE API: Fetch wave data, sea temp, currents, and tidal data
    // Best Practices Applied:
    // - cell_selection: 'sea' to prioritize ocean grid cells
    // - timezone: 'auto' for user's local timezone
    // - Geolocation-based model selection for optimal accuracy
    // - 15-minute data for ocean currents when enabled

    // Build hourly parameters
    const hourlyParams = 'wave_height,wave_direction,wave_period,wave_peak_period,swell_wave_height,swell_wave_direction,swell_wave_period,swell_wave_peak_period,wind_wave_height,wind_wave_direction,wind_wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl';

    const marineParams = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      hourly: hourlyParams,
      daily: 'wave_height_max,wave_direction_dominant,wave_period_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max,wind_wave_height_max,wind_wave_direction_dominant,wind_wave_period_max',
      current: 'sea_surface_temperature,wave_height,wave_direction,wave_period,wave_peak_period,swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height,wind_wave_direction,wind_wave_period,ocean_current_velocity,ocean_current_direction,sea_level_height_msl',
      timezone: WEATHER_CONSTANTS.TIMEZONE,
      forecast_days: WEATHER_CONSTANTS.FORECAST_DAYS.toString(),
      models: marineModel,
      cell_selection: WEATHER_CONSTANTS.MARINE_CELL_SELECTION
    });

    // Add 15-minute data for ocean currents if enabled
    if (WEATHER_CONSTANTS.USE_15_MINUTE_DATA) {
      marineParams.set('minutely_15', 'ocean_current_velocity,ocean_current_direction');
    }

    // FORECAST API: Fetch atmospheric data (Wind, Temp, Pressure)
    // Best Practices Applied:
    // - cell_selection: 'land' for coastal/land data accuracy
    // - timezone: 'auto' for user's local timezone
    // - Geolocation-based model selection for optimal resolution
    // - Extended hourly data for 24-hour forecast display
    // - Extended daily data for 10-day forecast display
    const generalParams = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,visibility',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant',
      hourly: 'temperature_2m,apparent_temperature,is_day,pressure_msl,visibility,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,weather_code,precipitation_probability',
      timezone: WEATHER_CONSTANTS.TIMEZONE,
      forecast_days: WEATHER_CONSTANTS.FORECAST_DAYS.toString(),
      models: weatherModel,
      cell_selection: WEATHER_CONSTANTS.LAND_CELL_SELECTION
    });

    // Use rate limiter + deduplicatedFetch to prevent 429s and duplicate API calls
    const marineData = await globalRateLimiter.enqueue(() =>
      deduplicatedFetch<MarineApiResponse>(`${API_ENDPOINTS.MARINE}?${marineParams.toString()}`, undefined, { ttl: 300000 })
    );
    const generalDataRaw = await globalRateLimiter.enqueue(() =>
      deduplicatedFetch<ForecastApiResponse>(`${API_ENDPOINTS.FORECAST}?${generalParams.toString()}`, undefined, { ttl: 300000 })
    );

    const current = generalDataRaw.current;
    const daily = generalDataRaw.daily;
    const hourly = generalDataRaw.hourly;

    // Validate required data
    if (!current || !daily || !hourly || !marineData.hourly) {
      throw new Error('Invalid API response: missing required data');
    }

    const moonData = getMoonData(new Date());

    // Calculate Next Full Moon Date
    let daysToFull = 0;
    if (moonData.phaseValue < 0.5) {
      daysToFull = (0.5 - moonData.phaseValue) * 29.53;
    } else {
      daysToFull = (1.5 - moonData.phaseValue) * 29.53;
    }
    const nextFullMoon = addDays(new Date(), Math.round(daysToFull));

    // Estimate Moonrise/Moonset based on phase and sunrise
    const sunriseTime = parseISO(daily.sunrise?.[0] || new Date().toISOString());
    const phaseOffsetHours = moonData.phaseValue * 24;
    const estimatedMoonRise = addMinutes(sunriseTime, phaseOffsetHours * 60);
    const estimatedMoonSet = addMinutes(estimatedMoonRise, 12 * 60 + 25);

    // Find current hour index in hourly data for 24-hour forecast starting from now
    // When timezone='auto', API returns times in local timezone (e.g., "2026-01-21T18:00")
    // We need to match against local time, not UTC
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const currentHour = String(now.getHours()).padStart(2, '0');
    const nowLocalISO = `${currentYear}-${currentMonth}-${currentDay}T${currentHour}`;
    let currentHourIndex = hourly.time?.findIndex((t: string) => t.startsWith(nowLocalISO)) || 0;
    if (currentHourIndex === -1) currentHourIndex = 0;

    // Build hourly forecast for next 24+ hours (including sunrise/sunset markers)
    const hourlyForecast = hourly.time?.slice(currentHourIndex, currentHourIndex + 26).map((t: string, i: number) => ({
      time: t,
      temperature: hourly.temperature_2m?.[currentHourIndex + i] || 0,
      weatherCode: hourly.weather_code?.[currentHourIndex + i] || 0,
      isDay: (hourly.is_day?.[currentHourIndex + i] || 0) === 1,
      precipitationProbability: hourly.precipitation_probability?.[currentHourIndex + i] || 0,
      windSpeed: hourly.wind_speed_10m?.[currentHourIndex + i] || 0,
      windGusts: hourly.wind_gusts_10m?.[currentHourIndex + i] || 0
    })) || [];

    // Build 10-day daily forecast with extended data
    const dailyForecast = daily.time?.slice(0, 10).map((t: string, i: number) => ({
      time: t,
      code: daily.weather_code?.[i] || 0,
      tempMax: daily.temperature_2m_max?.[i] || 0,
      tempMin: daily.temperature_2m_min?.[i] || 0,
      sunrise: daily.sunrise?.[i] || '',
      sunset: daily.sunset?.[i] || '',
      precipitationProbability: daily.precipitation_probability_max?.[i] || 0,
      precipitationSum: daily.precipitation_sum?.[i] || 0,
      uvIndexMax: daily.uv_index_max?.[i] || 0,
      windSpeedMax: daily.wind_speed_10m_max?.[i] || 0
    })) || [];

    const general: GeneralWeather = {
      temperature: current.temperature_2m || 0,
      feelsLike: current.apparent_temperature || 0,
      humidity: current.relative_humidity_2m || 0,
      uvIndex: daily.uv_index_max?.[0] || 0,
      weatherCode: current.weather_code || 0,
      weatherDescription: getWeatherDescription(current.weather_code || 0),
      isDay: current.is_day === 1,
      sunrise: daily.sunrise?.[0] || '',
      sunset: daily.sunset?.[0] || '',
      moonrise: estimatedMoonRise.toISOString(),
      moonset: estimatedMoonSet.toISOString(),
      moonPhase: moonData.phase,
      moonIllumination: moonData.illumination,
      nextFullMoon: nextFullMoon.toISOString(),
      pressure: current.surface_pressure || 0,
      visibility: current.visibility || 0,
      dailyForecast,
      hourlyForecast
    };

    const tides = generateTideData(lat, lng);

    const mergedHourly = {
      ...marineData.hourly, // Waves, Sea Temp, Currents, Sea Level
      pressure_msl: hourly.pressure_msl || [],
      visibility: hourly.visibility || [],
      wind_speed_10m: hourly.wind_speed_10m || [],
      wind_direction_10m: hourly.wind_direction_10m || [],
      wind_gusts_10m: hourly.wind_gusts_10m || new Array(marineData.hourly.time.length).fill(0),
      relative_humidity_2m: hourly.relative_humidity_2m || [],
      uv_index: hourly.uv_index || [],
      weather_code: hourly.weather_code || [],
      precipitation_probability: hourly.precipitation_probability || [],
      is_day: hourly.is_day || []
    };

    // Construct the daily object with merged data from marine and forecast APIs
    const mergedDaily = {
      time: marineData.daily?.time || [],
      wave_height_max: marineData.daily?.wave_height_max || [],
      wave_period_max: marineData.daily?.wave_period_max || [],
      swell_wave_height_max: marineData.daily?.swell_wave_height_max || [],
      swell_wave_direction_dominant: marineData.daily?.swell_wave_direction_dominant || [],
      // These come from the forecast API daily data
      wind_speed_10m_max: daily.wind_speed_10m_max || [],
      wind_direction_10m_dominant: daily.wind_direction_10m_dominant || [],
      sunrise: daily.sunrise || [],
      sunset: daily.sunset || []
    };

    return {
      latitude: marineData.latitude,
      longitude: marineData.longitude,
      hourly_units: marineData.hourly_units || {
        wave_height: 'm',
        wind_speed_10m: 'm/s',
        swell_wave_height: 'm'
      },
      hourly: mergedHourly,
      daily: mergedDaily,
      tides,
      general,
      current: {
        // Extended current conditions for Dashboard
        windSpeed: current.wind_speed_10m || 0,
        windDirection: current.wind_direction_10m || 0,
        windGusts: current.wind_gusts_10m || ((current.wind_speed_10m || 0) * 1.3),
        seaTemperature: marineData.current?.sea_surface_temperature || 0,
        waveHeight: marineData.current?.wave_height || 0,
        wavePeriod: marineData.current?.wave_period || 0,
        swellHeight: marineData.current?.swell_wave_height || 0,
        swellDirection: marineData.current?.swell_wave_direction || 0,
        swellPeriod: marineData.current?.swell_wave_period || 0,
        pressure: current.surface_pressure || 0,
        visibility: current.visibility || 0,
        seaLevel: tides.currentHeight,
        uvIndex: (() => {
           // Use the same local time calculation as above
           const idx = hourly.time?.findIndex((t: string) => t.startsWith(nowLocalISO)) || -1;
           return idx !== -1 ? (hourly.uv_index?.[idx] || 0) : 0;
        })()
      }
    } as MarineWeatherData;

  } catch (error) {
    console.error("Failed to fetch weather data", error);
    throw error;
  }
};

export const fetchPointForecast = async (lat: number, lng: number): Promise<PointForecast> => {
  try {
    // Tap-to-query must default to best_match. Regional wave-only models like
    // dwd_ewam reject requests that include sea_surface_temperature / ocean
    // current variables (HTTP 400). best_match combines the right models
    // server-side for the mixed variable set we request below.
    const marineModel = 'best_match';
    const weatherModel = getModelForLocation(lat, lng, false);

    // Marine data with cell_selection: 'sea' for ocean accuracy
    // Best Practice: Request comprehensive marine parameters with optimal model
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      current: [
        // Wave data
        'wave_height', 'wave_period', 'wave_peak_period',
        // Swell data
        'swell_wave_height', 'swell_wave_direction', 'swell_wave_period',
        // Wind wave data
        'wind_wave_height', 'wind_wave_direction', 'wind_wave_period',
        // Ocean currents
        'ocean_current_velocity', 'ocean_current_direction',
        // Temperature
        'sea_surface_temperature'
      ].join(','),
      timezone: WEATHER_CONSTANTS.TIMEZONE,
      models: marineModel,
      cell_selection: WEATHER_CONSTANTS.MARINE_CELL_SELECTION
    });

    // Forecast data with cell_selection: 'land' for atmospheric accuracy
    const tempParams = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lng.toString(),
        current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        timezone: WEATHER_CONSTANTS.TIMEZONE,
        models: weatherModel,
        cell_selection: WEATHER_CONSTANTS.LAND_CELL_SELECTION
    });

    // Use rate limiter + deduplicatedFetch to prevent 429s
    const data = await globalRateLimiter.enqueue(() =>
      deduplicatedFetch<MarineApiResponse>(`${API_ENDPOINTS.MARINE}?${params.toString()}`, undefined, { ttl: 300000 })
    ).catch((): Partial<MarineApiResponse> => ({ latitude: lat, longitude: lng, current: {} }));
    const tempData = await globalRateLimiter.enqueue(() =>
      deduplicatedFetch<ForecastApiResponse>(`${API_ENDPOINTS.FORECAST}?${tempParams.toString()}`, undefined, { ttl: 300000 })
    ).catch((): Partial<ForecastApiResponse> => ({ latitude: lat, longitude: lng, current: {} }));

    return {
      lat,
      lng,
      // Wave data
      waveHeight: data.current?.wave_height || 0,
      wavePeriod: data.current?.wave_period || 0,
      // Wind data
      windSpeed: tempData.current?.wind_speed_10m || 0,
      windDirection: tempData.current?.wind_direction_10m || 0,
      // Swell data
      swellHeight: data.current?.swell_wave_height || 0,
      swellDirection: data.current?.swell_wave_direction || 0,
      swellPeriod: data.current?.swell_wave_period || 0,
      // Wind wave data
      windWaveHeight: data.current?.wind_wave_height || 0,
      windWaveDirection: data.current?.wind_wave_direction || 0,
      windWavePeriod: data.current?.wind_wave_period || 0,
      // Ocean current data
      currentSpeed: data.current?.ocean_current_velocity || 0,
      currentDirection: data.current?.ocean_current_direction || 0,
      // Temperature & weather
      temp: tempData.current?.temperature_2m || 0,
      weatherCode: tempData.current?.weather_code || 0,
      weatherDesc: getWeatherDescription(tempData.current?.weather_code || 0),
      // Gusts & sea temp for activity layer popups
      windGusts: tempData.current?.wind_gusts_10m || 0,
      seaTemp: data.current?.sea_surface_temperature || 0,
    };
  } catch (error) {
    console.error("Point forecast error", error);
    return {
      lat,
      lng,
      waveHeight: 0,
      wavePeriod: 0,
      windSpeed: 0,
      windDirection: 0,
      swellHeight: 0,
      swellDirection: 0,
      swellPeriod: 0,
      windWaveHeight: 0,
      windWaveDirection: 0,
      windWavePeriod: 0,
      currentSpeed: 0,
      currentDirection: 0,
      temp: 0,
      weatherCode: 0,
      weatherDesc: 'Unavailable'
    };
  }
};

export const fetchHourlyPointForecast = async (lat: number, lng: number): Promise<DetailedPointForecast | null> => {
  try {
    // Get optimal models for this location
    const marineModel = getModelForLocation(lat, lng, true);
    const weatherModel = getModelForLocation(lat, lng, false);

    // We combine calls here to get best of both worlds: Accurate Wind + Accurate Waves
    // Best Practice: Use cell_selection to optimize for each data type + geolocation-based model
    const marineParams = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      hourly: 'wave_height,wave_period,swell_wave_height,swell_wave_period,ocean_current_velocity,ocean_current_direction,sea_level_height_msl',
      timezone: WEATHER_CONSTANTS.TIMEZONE,
      forecast_days: '2',
      models: marineModel,
      cell_selection: WEATHER_CONSTANTS.MARINE_CELL_SELECTION
    });

    // Add 15-minute data for ocean currents if enabled
    if (WEATHER_CONSTANTS.USE_15_MINUTE_DATA) {
      marineParams.set('minutely_15', 'ocean_current_velocity,ocean_current_direction');
    }

    const forecastParams = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      timezone: WEATHER_CONSTANTS.TIMEZONE,
      forecast_days: '2',
      models: weatherModel,
      cell_selection: WEATHER_CONSTANTS.LAND_CELL_SELECTION
    });

    // Use rate limiter + deduplicatedFetch to prevent 429s
    const marineData = await globalRateLimiter.enqueue(() =>
      deduplicatedFetch<MarineApiResponse>(`${API_ENDPOINTS.MARINE}?${marineParams.toString()}`, undefined, { ttl: 300000 })
    );
    const forecastData = await globalRateLimiter.enqueue(() =>
      deduplicatedFetch<ForecastApiResponse>(`${API_ENDPOINTS.FORECAST}?${forecastParams.toString()}`, undefined, { ttl: 300000 })
    );

    // Validate required data
    if (!marineData.hourly || !forecastData.hourly) {
      return null;
    }

    // Slice next 24 hours starting from now
    // Use local time to match API response with timezone='auto'
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const currentHour = String(now.getHours()).padStart(2, '0');
    const nowLocalISO = `${currentYear}-${currentMonth}-${currentDay}T${currentHour}`;
    let startIndex = marineData.hourly.time?.findIndex((t: string) => t.startsWith(nowLocalISO)) || 0;
    if (startIndex === -1) startIndex = 0;

    const endIndex = startIndex + 24;

    return {
      lat,
      lng,
      hourly: {
        time: marineData.hourly.time?.slice(startIndex, endIndex) || [],
        waveHeight: marineData.hourly.wave_height?.slice(startIndex, endIndex) || [],
        swellHeight: marineData.hourly.swell_wave_height?.slice(startIndex, endIndex) || [],
        currentSpeed: marineData.hourly.ocean_current_velocity?.slice(startIndex, endIndex) || [],
        currentDirection: marineData.hourly.ocean_current_direction?.slice(startIndex, endIndex) || [],
        windSpeed: forecastData.hourly.wind_speed_10m?.slice(startIndex, endIndex) || [],
        windDirection: forecastData.hourly.wind_direction_10m?.slice(startIndex, endIndex) || [],
      }
    };
  } catch (error) {
    console.error("Hourly Point forecast error", error);
    return null;
  }
};


export const fetchBulkPointForecast = async (coordinates: {lat: number, lng: number}[]): Promise<PointForecast[]> => {
  if (coordinates.length === 0) return [];

  // Limit coordinates to avoid HTTP 400/414 errors from Open-Meteo API
  // API has limits on number of coordinates per request
  const MAX_COORDINATES = 50; // Safe limit for bulk requests
  const limitedCoords = coordinates.slice(0, MAX_COORDINATES);

  if (coordinates.length > MAX_COORDINATES) {
    console.warn(`[WeatherService] Bulk forecast limited from ${coordinates.length} to ${MAX_COORDINATES} coordinates`);
  }

  // Open-Meteo allows comma separated lists for bulk queries
  // This is an optimization to reduce API calls
  const lats = limitedCoords.map(c => c.lat.toFixed(4)).join(',');
  const lngs = limitedCoords.map(c => c.lng.toFixed(4)).join(',');

  // For bulk requests, use the model based on the center of the bounding box
  const centerLat = limitedCoords.reduce((sum, c) => sum + c.lat, 0) / limitedCoords.length;
  const centerLng = limitedCoords.reduce((sum, c) => sum + c.lng, 0) / limitedCoords.length;
  const marineModel = getModelForLocation(centerLat, centerLng, true);
  const weatherModel = getModelForLocation(centerLat, centerLng, false);

  try {
    // Helper function to fetch with fallback to best_match on 400 errors
    const fetchWithFallback = async <T>(
      baseUrl: string,
      params: URLSearchParams,
      primaryModel: string
    ): Promise<T> => {
      try {
        return await globalRateLimiter.enqueue(() =>
          deduplicatedFetch<T>(`${baseUrl}?${params.toString()}`, undefined, { ttl: 300000 })
        );
      } catch (error: any) {
        // If primary model fails with 400, try fallback to best_match
        if (error?.message?.includes('400') && primaryModel !== 'best_match') {
          console.warn(`[WeatherService] ${primaryModel} failed with 400, trying fallback: best_match`);
          params.set('models', 'best_match');
          return await globalRateLimiter.enqueue(() =>
            deduplicatedFetch<T>(`${baseUrl}?${params.toString()}`, undefined, { ttl: 300000 })
          );
        }
        throw error;
      }
    };

    // Marine data with cell_selection: 'sea' for accurate ocean data
    const marineParams = new URLSearchParams({
      latitude: lats,
      longitude: lngs,
      current: 'wave_height,wave_period,wave_peak_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,wind_wave_height,wind_wave_direction,wind_wave_period',
      timezone: WEATHER_CONSTANTS.TIMEZONE,
      models: marineModel,
      cell_selection: WEATHER_CONSTANTS.MARINE_CELL_SELECTION
    });

    // Forecast data with cell_selection: 'land' for atmospheric accuracy
    const forecastParams = new URLSearchParams({
        latitude: lats,
        longitude: lngs,
        current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        timezone: WEATHER_CONSTANTS.TIMEZONE,
        models: weatherModel,
        cell_selection: WEATHER_CONSTANTS.LAND_CELL_SELECTION
    });

    // Use deduplicatedFetch with fallback for bulk requests
    const [marineData, forecastData] = await Promise.all([
        fetchWithFallback<MarineApiResponse | MarineApiResponse[]>(API_ENDPOINTS.MARINE, marineParams, marineModel),
        fetchWithFallback<ForecastApiResponse | ForecastApiResponse[]>(API_ENDPOINTS.FORECAST, forecastParams, weatherModel)
    ]);

    // Handle single vs array response
    const marineResults = Array.isArray(marineData) ? marineData : [marineData];
    const forecastResults = Array.isArray(forecastData) ? forecastData : [forecastData];

    return marineResults.map((m: MarineApiResponse, i: number) => {
        const f: ForecastApiResponse = forecastResults[i] || { latitude: m.latitude, longitude: m.longitude };
        return {
            lat: m.latitude,
            lng: m.longitude,
            waveHeight: m.current?.wave_height || 0,
            wavePeriod: m.current?.wave_period || 0,
            windSpeed: f.current?.wind_speed_10m || 0,
            windDirection: f.current?.wind_direction_10m || 0,
            swellHeight: m.current?.swell_wave_height || 0,
            swellDirection: m.current?.swell_wave_direction || 0,
            swellPeriod: m.current?.swell_wave_period || 0,
            temp: f.current?.temperature_2m || 0,
            weatherCode: f.current?.weather_code || 0,
            weatherDesc: getWeatherDescription(f.current?.weather_code || 0),
            currentSpeed: m.current?.ocean_current_velocity || 0,
            currentDirection: m.current?.ocean_current_direction || 0,
            windWaveHeight: m.current?.wind_wave_height || 0,
            windWaveDirection: m.current?.wind_wave_direction || 0,
            windWavePeriod: m.current?.wind_wave_period || 0
        };
    });

  } catch (error) {
    console.error("Bulk forecast error", error);
    return [];
  }
};

/**
 * Fetch seafloor depth (in meters) at a coordinate via Open-Meteo Elevation API.
 * Returns `null` on land (elevation >= 0) or on error.
 */
export const fetchDepth = async (lat: number, lng: number): Promise<number | null> => {
  try {
    const data = await deduplicatedFetch<{ elevation: number[] }>(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`,
      undefined,
      { ttl: 86400000 } // Elevation is static — cache for 24h
    );
    const elevation = data?.elevation?.[0];
    if (typeof elevation !== 'number') return null;
    return elevation < 0 ? Math.abs(elevation) : null;
  } catch (error) {
    console.error('fetchDepth error', error);
    return null;
  }
};

export const searchLocations = async (query: string): Promise<Location[]> => {
  if (query.length < 3) return [];

  try {
    // Use deduplicatedFetch with longer TTL for geocoding (5 seconds)
    // Search queries are often repeated as user types
    const data: GeocodingApiResponse = await deduplicatedFetch<GeocodingApiResponse>(
      `${API_ENDPOINTS.GEOCODING}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`,
      undefined,
      { ttl: 5000 }
    );

    return (data.results || []).map((item) => ({
      id: item.id,
      name: item.name,
      country: item.country,
      lat: item.latitude,
      lng: item.longitude,
      admin1: item.admin1
    }));
  } catch (error) {
    console.error("Search error", error);
    return [];
  }
};

export const reverseGeocode = async (lat: number, lng: number): Promise<Location | null> => {
    try {
        // Nominatim reverse geocoding (Open-Meteo has no /v1/reverse endpoint).
        // Nominatim returns { place_id, display_name, address: { city/town/village, country, ... }, lat, lon }
        const nominatimReverseUrl = API_ENDPOINTS.NOMINATIM.replace('/search', '/reverse');
        const data = await deduplicatedFetch<{
          place_id?: number;
          display_name?: string;
          lat?: string;
          lon?: string;
          address?: {
            city?: string;
            town?: string;
            village?: string;
            municipality?: string;
            county?: string;
            state?: string;
            country?: string;
          };
        }>(
          `${nominatimReverseUrl}?lat=${lat}&lon=${lng}&format=json`,
          { headers: { 'User-Agent': 'SeaYou-MarineWeather/1.0' } },
          { ttl: 300000 } // Stable result - cache 5 minutes
        );

        if (!data?.address) return null;

        // Prefer city > town > village > municipality > county as the display name
        const name = data.address.city
          || data.address.town
          || data.address.village
          || data.address.municipality
          || data.address.county
          || data.display_name?.split(',')[0]
          || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;

        return {
          id: data.place_id ?? -1,
          name,
          country: data.address.country,
          lat: parseFloat(data.lat ?? String(lat)),
          lng: parseFloat(data.lon ?? String(lng)),
          admin1: data.address.state,
        };

    } catch (e) {
        console.error("Reverse geocode error", e);
        return null;
    }
};
