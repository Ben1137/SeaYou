// Node.js 18+ has fetch built-in

const lat = 40.7128; // New York
const lng = -74.0060;

async function fetchForecastData() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=10`;

  console.log(`Fetching from: ${url}`);
  const response = await fetch(url);
  const data = await response.json() as any;
  return data.daily;
}

function testZeroDiff(daily: any) {
  // Get today's date
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentDay = String(now.getDate()).padStart(2, '0');
  const nowLocalDate = `${currentYear}-${currentMonth}-${currentDay}`;

  console.log(`\n=== TODAY: ${nowLocalDate} ===\n`);
  console.log(`First 5 dates in API response: ${daily.time.slice(0, 5).join(', ')}`);

  // OLD CODE — hardcoded slice(0, 10) with bare [i]
  const oldForecast = daily.time?.slice(0, 10).map((t: string, i: number) => ({
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

  // NEW CODE — anchor-relative with buildDaily helper
  let todayDailyIndex = daily.time?.findIndex((t: string) => t.startsWith(nowLocalDate)) ?? 0;
  if (todayDailyIndex < 0) todayDailyIndex = 0;

  console.log(`todayDailyIndex: ${todayDailyIndex}`);

  const buildDaily = (startIdx: number, endIdx: number) =>
    daily.time?.slice(startIdx, endIdx).map((t: string, i: number) => {
      const idx = startIdx + i;
      return {
        time: t,
        code: daily.weather_code?.[idx] || 0,
        tempMax: daily.temperature_2m_max?.[idx] || 0,
        tempMin: daily.temperature_2m_min?.[idx] || 0,
        sunrise: daily.sunrise?.[idx] || '',
        sunset: daily.sunset?.[idx] || '',
        precipitationProbability: daily.precipitation_probability_max?.[idx] || 0,
        precipitationSum: daily.precipitation_sum?.[idx] || 0,
        uvIndexMax: daily.uv_index_max?.[idx] || 0,
        windSpeedMax: daily.wind_speed_10m_max?.[idx] || 0
      };
    }) || [];

  const newForecast = buildDaily(todayDailyIndex, todayDailyIndex + 10);

  // Compare
  const oldJson = JSON.stringify(oldForecast);
  const newJson = JSON.stringify(newForecast);
  const match = oldJson === newJson;

  console.log(`\nMATCH: ${match}`);
  console.log(`\nOLD CODE JSON:\n${oldJson}`);
  console.log(`\nNEW CODE JSON:\n${newJson}`);
}

(async () => {
  try {
    const daily = await fetchForecastData();
    testZeroDiff(daily);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
