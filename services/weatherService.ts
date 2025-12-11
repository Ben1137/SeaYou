
import { MarineWeatherData, TideData, TideEvent, PointForecast, GeneralWeather, Location, DetailedPointForecast } from '../types';
import { addHours, format, startOfHour, addDays, parseISO, addMinutes } from 'date-fns';

const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/reverse';

// Helper: Convert WMO Weather Code to String
export const getWeatherDescription = (code: number): string => {
  const codes: Record<number, string> = {
    0: 'Clear Sky',
    1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Depositing Rime Fog',
    51: 'Light Drizzle', 53: 'Moderate Drizzle', 55: 'Dense Drizzle',
    61: 'Slight Rain', 63: 'Moderate Rain', 65: 'Heavy Rain',
    71: 'Slight Snow', 73: 'Moderate Snow', 75: 'Heavy Snow',
    77: 'Snow Grains',
    80: 'Slight Rain Showers', 81: 'Moderate Rain Showers', 82: 'Violent Rain Showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with Hail', 99: 'Heavy Hail Thunderstorm'
  };
  return codes[code] || 'Unknown';
};

// Calculate Moon Phase & Illumination
const getMoonData = (date: Date) => {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();

  if (month < 3) {
    year--;
    month += 12;
  }

  const c = 365.25 * year;
  const e = 30.6 * month;
  const jd = c + e + day - 694039.09; // jd is total days elapsed
  let b = jd / 29.5305882; // divide by the moon cycle
  b -= Math.floor(b); // get the decimal part (phase 0..1)
  
  // b is 0..1 (0=New, 0.5=Full, 1=New)
  const illumination = Math.round((0.5 - Math.cos(b * 2 * Math.PI) / 2) * 100);
  
  const phaseIndex = Math.round(b * 8) % 8;
  const phases = [
    'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
    'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'
  ];

  return {
    phase: phases[phaseIndex],
    illumination,
    phaseValue: b // Raw phase value for calculations
  };
};

export const searchLocations = async (query: string): Promise<Location[]> => {
  if (!query || query.length < 2) return [];
  try {
    const response = await fetch(`${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
    if (!response.ok) return [];
    const data = await response.json();
    if (!data.results) return [];
    
    return data.results.map((item: any) => ({
      id: item.id,
      name: item.name,
      lat: item.latitude,
      lng: item.longitude,
      country: item.country,
      admin1: item.admin1
    }));
  } catch (error) {
    console.error("Geocoding error", error);
    return [];
  }
};

export const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  try {
    // Basic validation to prevent bad requests
    if (isNaN(lat) || isNaN(lng)) return null;

    const response = await fetch(`${REVERSE_GEOCODING_URL}?latitude=${lat}&longitude=${lng}&language=en&format=json`);
    
    // If not OK (e.g. 404 because it's ocean), just return null silently
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].name;
    }
    return null;
  } catch (error) {
    // Suppress warnings for open sea (404s are expected)
    return null;
  }
};

const generateTideData = (lat: number, lng: number): TideData => {
  const now = new Date();
  const hourlyTides: { time: string; height: number }[] = [];
  const startHour = startOfHour(now);

  // Generate 48 hours of data
  for (let i = 0; i < 48; i++) {
    const time = addHours(startHour, i);
    const t = time.getTime() / (1000 * 60 * 60); // hours
    const period = 12.42; // M2 Tidal Constituent
    const phase = (lng / 180) * 12; // approximate phase shift based on longitude
    
    // Simple harmonic motion approximation formula
    const height = 1.2 + Math.cos(2 * Math.PI * (t + phase) / period) * 1.5;
    
    hourlyTides.push({
      time: time.toISOString(),
      height: parseFloat(height.toFixed(2))
    });
  }

  // Find the next High and Low points by comparing neighbors
  let nextHigh: TideEvent | null = null;
  let nextLow: TideEvent | null = null;
  
  for (let i = 1; i < hourlyTides.length - 1; i++) {
    const prev = hourlyTides[i-1].height;
    const curr = hourlyTides[i].height;
    const next = hourlyTides[i+1].height;

    // Peak detection
    if (!nextHigh && curr > prev && curr > next) {
      nextHigh = { time: hourlyTides[i].time, height: curr, type: 'HIGH' };
    }
    // Trough detection
    if (!nextLow && curr < prev && curr < next) {
      nextLow = { time: hourlyTides[i].time, height: curr, type: 'LOW' };
    }
    if (nextHigh && nextLow) break;
  }

  // Fallbacks if peaks aren't found in the immediate window
  if (!nextHigh) nextHigh = { time: addHours(now, 6).toISOString(), height: 2.5, type: 'HIGH' };
  if (!nextLow) nextLow = { time: addHours(now, 12).toISOString(), height: 0.2, type: 'LOW' };

  return {
    currentHeight: hourlyTides[0].height,
    rising: hourlyTides[1].height > hourlyTides[0].height,
    nextHigh,
    nextLow,
    hourly: hourlyTides
  };
};

export const fetchMarineWeather = async (lat: number, lng: number): Promise<MarineWeatherData> => {
  try {
    // MARINE API: Only fetch wave data & Sea Surface Temp.
    const marineParams = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      hourly: 'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature',
      daily: 'wave_height_max,swell_wave_height_max,swell_wave_direction_dominant,wave_period_max',
      current: 'sea_surface_temperature,wave_height,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period',
      timezone: 'GMT', 
      forecast_days: '7',
      models: 'best_match'
    });

    // FORECAST API: Fetch atmospheric data (Wind, Temp, Pressure)
    const generalParams = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,visibility', 
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max',
      hourly: 'pressure_msl,visibility,relative_humidity_2m,wind_speed_10m,wind_direction_10m,uv_index,weather_code', 
      timezone: 'GMT',
      models: 'best_match'
    });

    const [marineResponse, generalResponse] = await Promise.all([
      fetch(`${MARINE_URL}?${marineParams.toString()}`),
      fetch(`${FORECAST_URL}?${generalParams.toString()}`)
    ]);
    
    if (!marineResponse.ok) {
       console.error("Marine API error", await marineResponse.text());
       throw new Error(`Marine API Error: ${marineResponse.status}`);
    }
    if (!generalResponse.ok) {
       console.error("General Weather API error", await generalResponse.text());
       throw new Error(`Weather API Error: ${generalResponse.status}`);
    }

    const marineData = await marineResponse.json();
    const generalDataRaw = await generalResponse.json();

    const current = generalDataRaw.current;
    const daily = generalDataRaw.daily;
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
    const sunriseTime = parseISO(daily.sunrise[0]);
    const phaseOffsetHours = moonData.phaseValue * 24; 
    const estimatedMoonRise = addMinutes(sunriseTime, phaseOffsetHours * 60);
    const estimatedMoonSet = addMinutes(estimatedMoonRise, 12 * 60 + 25); 

    const general: GeneralWeather = {
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      uvIndex: daily.uv_index_max[0],
      weatherCode: current.weather_code,
      weatherDescription: getWeatherDescription(current.weather_code),
      isDay: current.is_day === 1,
      sunrise: daily.sunrise[0],
      sunset: daily.sunset[0],
      moonrise: estimatedMoonRise.toISOString(), 
      moonset: estimatedMoonSet.toISOString(),
      moonPhase: moonData.phase,
      moonIllumination: moonData.illumination,
      nextFullMoon: nextFullMoon.toISOString(),
      pressure: current.surface_pressure,
      visibility: current.visibility,
      dailyForecast: daily.time.slice(0, 3).map((t: string, i: number) => ({
        time: t,
        code: daily.weather_code[i],
        tempMax: daily.temperature_2m_max[i],
        tempMin: daily.temperature_2m_min[i]
      }))
    };

    const tides = generateTideData(lat, lng);

    const mergedHourly = {
      ...marineData.hourly, // Waves, Sea Temp
      pressure_msl: generalDataRaw.hourly.pressure_msl, // Atmos
      visibility: generalDataRaw.hourly.visibility, // Atmos
      wind_speed_10m: generalDataRaw.hourly.wind_speed_10m, // High Res Atmos Wind
      wind_direction_10m: generalDataRaw.hourly.wind_direction_10m, // High Res Atmos Wind
      wind_gusts_10m: new Array(marineData.hourly.time.length).fill(0), // Placeholder (avoiding 400s)
      relative_humidity_2m: generalDataRaw.hourly.relative_humidity_2m,
      uv_index: generalDataRaw.hourly.uv_index,
      weather_code: generalDataRaw.hourly.weather_code
    };

    return {
      ...marineData,
      hourly: mergedHourly,
      tides,
      general,
      current: {
        // Extended current conditions for Dashboard
        windSpeed: current.wind_speed_10m,
        windDirection: current.wind_direction_10m,
        windGusts: current.wind_gusts_10m || (current.wind_speed_10m * 1.3),
        seaTemperature: marineData.current?.sea_surface_temperature || 0,
        waveHeight: marineData.current?.wave_height || 0,
        wavePeriod: marineData.current?.wave_period || 0,
        swellHeight: marineData.current?.swell_wave_height || 0,
        swellDirection: marineData.current?.swell_wave_direction || 0,
        swellPeriod: marineData.current?.swell_wave_period || 0,
        pressure: current.surface_pressure,
        visibility: current.visibility,
        seaLevel: tides.currentHeight,
        uvIndex: (() => {
           const nowISO = new Date().toISOString().slice(0, 13);
           const idx = generalDataRaw.hourly.time.findIndex((t: string) => t.startsWith(nowISO));
           return idx !== -1 ? generalDataRaw.hourly.uv_index[idx] : 0;
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
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      current: 'wave_height,swell_wave_height,swell_wave_direction,sea_surface_temperature', 
      timezone: 'GMT',
      models: 'best_match'
    });

    const response = await fetch(`${MARINE_URL}?${params.toString()}`);
    const data = response.ok ? await response.json() : { current: {} };
    
    const tempParams = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lng.toString(),
        current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m',
        timezone: 'GMT',
        models: 'best_match'
    });
    const tempResponse = await fetch(`${FORECAST_URL}?${tempParams.toString()}`);
    const tempData = tempResponse.ok ? await tempResponse.json() : { current: {} };

    return {
      lat,
      lng,
      waveHeight: data.current?.wave_height || 0,
      windSpeed: tempData.current?.wind_speed_10m || 0,
      windDirection: tempData.current?.wind_direction_10m || 0,
      swellHeight: data.current?.swell_wave_height || 0,
      swellDirection: data.current?.swell_wave_direction || 0,
      temp: tempData.current?.temperature_2m || 0,
      weatherCode: tempData.current?.weather_code || 0,
      weatherDesc: getWeatherDescription(tempData.current?.weather_code || 0)
    };
  } catch (error) {
    console.error("Point forecast error", error);
    return {
      lat,
      lng,
      waveHeight: 0,
      windSpeed: 0,
      windDirection: 0,
      swellHeight: 0,
      swellDirection: 0,
      temp: 0,
      weatherCode: 0,
      weatherDesc: 'Unavailable'
    };
  }
};

export const fetchHourlyPointForecast = async (lat: number, lng: number): Promise<DetailedPointForecast | null> => {
  try {
    // We combine calls here to get best of both worlds: Accurate Wind + Accurate Waves
    const marineParams = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      hourly: 'wave_height,swell_wave_height,ocean_current_velocity,ocean_current_direction',
      timezone: 'GMT',
      forecast_days: '2',
      models: 'best_match'
    });
    
    const forecastParams = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      hourly: 'wind_speed_10m,wind_direction_10m',
      timezone: 'GMT',
      forecast_days: '2',
      models: 'best_match'
    });

    const [marineRes, forecastRes] = await Promise.all([
        fetch(`${MARINE_URL}?${marineParams.toString()}`),
        fetch(`${FORECAST_URL}?${forecastParams.toString()}`)
    ]);

    if (!marineRes.ok || !forecastRes.ok) return null;
    const marineData = await marineRes.json();
    const forecastData = await forecastRes.json();
    
    // Slice next 24 hours starting from now
    const nowISO = new Date().toISOString().slice(0, 13);
    let startIndex = marineData.hourly.time.findIndex((t: string) => t.startsWith(nowISO));
    if (startIndex === -1) startIndex = 0;
    
    const endIndex = startIndex + 24;

    return {
      lat,
      lng,
      hourly: {
        time: marineData.hourly.time.slice(startIndex, endIndex),
        waveHeight: marineData.hourly.wave_height.slice(startIndex, endIndex),
        swellHeight: marineData.hourly.swell_wave_height.slice(startIndex, endIndex),
        currentSpeed: marineData.hourly.ocean_current_velocity?.slice(startIndex, endIndex) || [],
        currentDirection: marineData.hourly.ocean_current_direction?.slice(startIndex, endIndex) || [],
        windSpeed: forecastData.hourly.wind_speed_10m.slice(startIndex, endIndex),
        windDirection: forecastData.hourly.wind_direction_10m.slice(startIndex, endIndex),
      }
    };
  } catch (error) {
    console.error("Hourly Point forecast error", error);
    return null;
  }
};


export const fetchBulkPointForecast = async (coordinates: {lat: number, lng: number}[]): Promise<PointForecast[]> => {
  if (coordinates.length === 0) return [];

  // Open-Meteo allows comma separated lists
  const lats = coordinates.map(c => c.lat.toFixed(4)).join(',');
  const lngs = coordinates.map(c => c.lng.toFixed(4)).join(',');

  try {
    const marineParams = new URLSearchParams({
      latitude: lats,
      longitude: lngs,
      current: 'wave_height,wave_period,swell_wave_height,swell_wave_direction,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,wind_wave_height,wind_wave_direction,wind_wave_period', 
      timezone: 'GMT',
      models: 'best_match'
    });
    
    const forecastParams = new URLSearchParams({
        latitude: lats,
        longitude: lngs,
        current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m',
        timezone: 'GMT',
        models: 'best_match'
    });

    const [marineRes, forecastRes] = await Promise.all([
        fetch(`${MARINE_URL}?${marineParams.toString()}`),
        fetch(`${FORECAST_URL}?${forecastParams.toString()}`)
    ]);

    const marineData = await marineRes.json();
    const forecastData = await forecastRes.json();

    // Handle single vs array response
    const marineResults = Array.isArray(marineData) ? marineData : [marineData];
    const forecastResults = Array.isArray(forecastData) ? forecastData : [forecastData];

    return marineResults.map((m: any, i: number) => {
        const f = forecastResults[i] || {};
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
