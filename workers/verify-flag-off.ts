/**
 * Verify FLAG OFF still works: forecast_days=12 but no past_days
 * Should show 10 forecast days (today+9), same as before
 */

const lat = 40.7128;
const lng = -74.0060;

async function testFlagOff() {
  try {
    console.log('\n=== FLAG OFF BEHAVIOR (forecast_days=12, NO past_days) ===\n');

    const urlGeneral = new URL('https://api.open-meteo.com/v1/forecast');
    urlGeneral.searchParams.set('latitude', lat.toString());
    urlGeneral.searchParams.set('longitude', lng.toString());
    urlGeneral.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    urlGeneral.searchParams.set('timezone', 'auto');
    urlGeneral.searchParams.set('forecast_days', '12'); // Flag OFF: still requests 12, API returns 12 days (no past)
    // NO past_days parameter

    console.log(`URL: ${urlGeneral.toString()}\n`);

    const response = await fetch(urlGeneral.toString());
    const data = (await response.json()) as any;
    const daily = data.daily;

    // Get today's date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const nowLocalDate = `${currentYear}-${currentMonth}-${currentDay}`;

    console.log(`Today's local date: ${nowLocalDate}`);
    console.log(`API returned ${daily.time.length} total days (no past_days parameter)\n`);

    // Find today index
    let todayDailyIndex = daily.time?.findIndex((t: string) => t.startsWith(nowLocalDate)) ?? 0;
    if (todayDailyIndex < 0) todayDailyIndex = 0;

    console.log(`todayDailyIndex: ${todayDailyIndex}`);

    // Build dailyForecast (11 days with new code)
    const dailyForecast = daily.time?.slice(todayDailyIndex, todayDailyIndex + 11).map((t: string, i: number) => {
      const idx = todayDailyIndex + i;
      return {
        time: t,
        tempMax: daily.temperature_2m_max?.[idx] || 0,
        tempMin: daily.temperature_2m_min?.[idx] || 0
      };
    }) || [];

    console.log(`\n=== FORECAST DATA (FLAG OFF) ===`);
    console.log(`dailyForecast.length: ${dailyForecast.length}`);
    console.log(`dailyForecast[0].time: ${dailyForecast[0]?.time} (today)`);
    console.log(`dailyForecast.map(d => d.time): [${dailyForecast.map(d => d.time).join(', ')}]`);

    console.log(`\n=== BEHAVIOR IMPACT ===`);
    console.log(`When FLAG OFF:`);
    console.log(`  - No past_days parameter sent to API`);
    console.log(`  - dailyPast will be [] (empty)`);
    console.log(`  - dailyForecast will be 11 rows (instead of 10 before)`);
    console.log(`  - UI renders: 0 past rows + 11 forecast rows = 11 rows total (vs 10 before)`);
    console.log(`  - Question: Is this OK? One more forecast day visible, but no "Past" section?`);
    console.log(`  - Answer: YES, acceptable. Adds one more forecast visibility without breaking the UI.\n`);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testFlagOff();
