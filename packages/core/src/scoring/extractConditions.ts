import { MarineWeatherData, HourlyConditions } from '../types';

export function extractHourlyConditions(
  data: MarineWeatherData,
  hourIndex: number
): HourlyConditions {
  const h = data.hourly;
  return {
    time: h.time[hourIndex] || '',
    waveHeight: h.wave_height[hourIndex] || 0,
    wavePeriod: h.wave_period[hourIndex] || 0,
    swellHeight: h.swell_wave_height[hourIndex] || 0,
    swellPeriod: h.swell_wave_period[hourIndex] || 0,
    swellDirection: h.swell_wave_direction[hourIndex] || 0,
    windSpeed: h.wind_speed_10m[hourIndex] || 0,
    windGusts: h.wind_gusts_10m[hourIndex] || 0,
    windDirection: h.wind_direction_10m[hourIndex] || 0,
    windWaveHeight: h.wind_wave_height?.[hourIndex],
    currentSpeed: h.ocean_current_velocity?.[hourIndex],
    currentDirection: h.ocean_current_direction?.[hourIndex],
    seaTemp: h.sea_surface_temperature?.[hourIndex],
    visibility: h.visibility?.[hourIndex],
    uvIndex: h.uv_index?.[hourIndex],
    weatherCode: h.weather_code?.[hourIndex],
    pressure: h.pressure_msl?.[hourIndex],
  };
}

export function extractCurrentConditions(data: MarineWeatherData): HourlyConditions {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentDay = String(now.getDate()).padStart(2, '0');
  const currentHour = String(now.getHours()).padStart(2, '0');
  const nowLocalISO = `${currentYear}-${currentMonth}-${currentDay}T${currentHour}`;

  let idx = data.hourly.time.findIndex(t => t.startsWith(nowLocalISO));
  if (idx === -1) idx = 0;

  return extractHourlyConditions(data, idx);
}
