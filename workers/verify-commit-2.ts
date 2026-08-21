// Verify Commit 2: Feature flag + past data
// Run: npx tsx workers/verify-commit-2.ts

const lat = 40.7128; // New York
const lng = -74.0060;

interface DailyForecastItem {
  time: string;
  code: number;
  tempMax: number;
  tempMin: number;
  sunrise: string;
  sunset: string;
  precipitationProbability: number;
  precipitationSum: number;
  uvIndexMax: number;
  windSpeedMax: number;
}

async function fetchAndBuild(timelineOn: boolean) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toString());
  url.searchParams.set('longitude', lng.toString());
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '10');

  if (timelineOn) {
    url.searchParams.set('past_days', '3');
  }

  console.log(`\n=== FLAG ${timelineOn ? 'ON' : 'OFF'} ===`);
  console.log(`URL: ${url.toString()}\n`);

  const response = await fetch(url.toString());
  const data = await response.json() as any;
  const daily = data.daily;

  // Mimic the logic in weatherService.ts
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentDay = String(now.getDate()).padStart(2, '0');
  const nowLocalDate = `${currentYear}-${currentMonth}-${currentDay}`;

  let todayDailyIndex = daily.time?.findIndex((t: string) => t.startsWith(nowLocalDate)) ?? 0;
  if (todayDailyIndex < 0) todayDailyIndex = 0;

  console.log(`todayDailyIndex: ${todayDailyIndex}`);

  const buildDaily = (startIdx: number, endIdx: number): DailyForecastItem[] =>
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

  const dailyForecast = buildDaily(todayDailyIndex, todayDailyIndex + 10);
  const dailyPast = timelineOn
    ? buildDaily(Math.max(0, todayDailyIndex - 3), todayDailyIndex)
    : [];

  console.log(`dailyForecast.length: ${dailyForecast.length}`);
  console.log(`dailyForecast[0].time: ${dailyForecast[0]?.time}`);
  console.log(`dailyPast.length: ${dailyPast.length}`);

  if (dailyPast.length > 0) {
    console.log(`dailyPast.map(d => d.time): [${dailyPast.map(d => d.time).join(', ')}]`);
  }

  return { dailyForecast, dailyPast, todayDailyIndex };
}

(async () => {
  try {
    console.log('=== COMMIT 2 VERIFICATION ===');

    // Test FLAG OFF
    const resultOff = await fetchAndBuild(false);

    // Test FLAG ON
    const resultOn = await fetchAndBuild(true);

    // Verify invariants
    console.log('\n=== INVARIANTS ===');
    console.log(`dailyForecast[0].time SAME in both states: ${resultOff.dailyForecast[0].time === resultOn.dailyForecast[0].time}`);
    console.log(`dailyForecast.length SAME in both states: ${resultOff.dailyForecast.length === resultOn.dailyForecast.length}`);
    console.log(`dailyForecast[0].time is today: ${resultOff.dailyForecast[0].time.startsWith('2026-08-19')}`);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
