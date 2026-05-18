import { MarineWeatherData, HourlyConditions } from '../types';

/**
 * Resolve whether a given hour is daylight.
 * Priority: hourly `is_day` array (Open-Meteo) → hour-of-day fallback (6am–8pm).
 */
function resolveIsDay(data: MarineWeatherData, hourIndex: number): boolean {
  const raw = data.hourly.is_day?.[hourIndex];
  if (raw !== undefined) return raw === 1;
  // Fallback: parse hour from ISO timestamp and assume day between 06:00 and 20:00
  const iso = data.hourly.time?.[hourIndex] || '';
  const match = iso.match(/T(\d{2}):/);
  if (match) {
    const hour = parseInt(match[1], 10);
    return hour >= 6 && hour < 20;
  }
  // Final fallback — assume day
  return true;
}

export function extractHourlyConditions(
  data: MarineWeatherData,
  hourIndex: number
): HourlyConditions {
  const h = data.hourly;
  // Marine arrays (wave, swell, sea temp) may be absent when the location is
  // inland and the Marine API returned null — guard every access with ?. ?? 0
  return {
    time: h.time?.[hourIndex] ?? '',
    waveHeight: h.wave_height?.[hourIndex] ?? 0,
    wavePeriod: h.wave_period?.[hourIndex] ?? 0,
    swellHeight: h.swell_wave_height?.[hourIndex] ?? 0,
    swellPeriod: h.swell_wave_period?.[hourIndex] ?? 0,
    swellDirection: h.swell_wave_direction?.[hourIndex] ?? 0,
    windSpeed: h.wind_speed_10m?.[hourIndex] ?? 0,
    windGusts: h.wind_gusts_10m?.[hourIndex] ?? 0,
    windDirection: h.wind_direction_10m?.[hourIndex] ?? 0,
    windWaveHeight: h.wind_wave_height?.[hourIndex] ?? undefined,
    currentSpeed: h.ocean_current_velocity?.[hourIndex] ?? undefined,
    currentDirection: h.ocean_current_direction?.[hourIndex] ?? undefined,
    seaTemp: h.sea_surface_temperature?.[hourIndex] ?? undefined,
    visibility: h.visibility?.[hourIndex] ?? undefined,
    uvIndex: h.uv_index?.[hourIndex] ?? undefined,
    weatherCode: h.weather_code?.[hourIndex] ?? undefined,
    pressure: h.pressure_msl?.[hourIndex] ?? undefined,
    isDay: resolveIsDay(data, hourIndex),
  };
}

export function extractCurrentConditions(data: MarineWeatherData): HourlyConditions {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentDay = String(now.getDate()).padStart(2, '0');
  const currentHour = String(now.getHours()).padStart(2, '0');
  const nowLocalISO = `${currentYear}-${currentMonth}-${currentDay}T${currentHour}`;

  let idx = (data.hourly.time ?? []).findIndex(t => t.startsWith(nowLocalISO));
  if (idx === -1) idx = 0;

  return extractHourlyConditions(data, idx);
}
