/**
 * Verify extended forecast + past data with real API call
 * FLAG ON: VITE_FEATURE_ATMOSPHERE_TIMELINE=true
 * Check that forecast_days=11 and past_days=3 produce correct array lengths
 */

const lat = 40.7128; // New York
const lng = -74.0060;

async function testExtendedForecast() {
  try {
    console.log('\n=== EXTENDED FORECAST VERIFICATION (FLAG ON) ===\n');

    // Build URLs matching the updated service logic
    const urlGeneral = new URL('https://api.open-meteo.com/v1/forecast');
    urlGeneral.searchParams.set('latitude', lat.toString());
    urlGeneral.searchParams.set('longitude', lng.toString());
    urlGeneral.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max');
    urlGeneral.searchParams.set('timezone', 'auto');
    urlGeneral.searchParams.set('forecast_days', '11'); // Extended from 10
    urlGeneral.searchParams.set('past_days', '3'); // With timeline enabled

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

    console.log(`Today's local date: ${nowLocalDate}\n`);

    // Find today index
    let todayDailyIndex = daily.time?.findIndex((t: string) => t.startsWith(nowLocalDate)) ?? 0;
    if (todayDailyIndex < 0) todayDailyIndex = 0;

    console.log(`todayDailyIndex: ${todayDailyIndex}`);

    // Build dailyPast (unchanged)
    const dailyPast = daily.time?.slice(Math.max(0, todayDailyIndex - 3), todayDailyIndex).map((t: string, i: number) => {
      const idx = Math.max(0, todayDailyIndex - 3) + i;
      return {
        time: t,
        tempMax: daily.temperature_2m_max?.[idx] || 0,
        tempMin: daily.temperature_2m_min?.[idx] || 0,
        code: daily.weather_code?.[idx] || 0
      };
    }) || [];

    // Build dailyForecast (extended to 11 rows)
    const dailyForecast = daily.time?.slice(todayDailyIndex, todayDailyIndex + 11).map((t: string, i: number) => {
      const idx = todayDailyIndex + i;
      return {
        time: t,
        tempMax: daily.temperature_2m_max?.[idx] || 0,
        tempMin: daily.temperature_2m_min?.[idx] || 0,
        code: daily.weather_code?.[idx] || 0
      };
    }) || [];

    // CRITICAL: Verify the 11th day is real (not null/empty)
    const eleventhDay = dailyForecast[10];

    console.log(`\n=== PAST DATA ===`);
    console.log(`dailyPast.length: ${dailyPast.length}`);
    if (dailyPast.length > 0) {
      console.log(`dailyPast.map(d => d.time): [${dailyPast.map(d => d.time).join(', ')}]`);
    }

    console.log(`\n=== FORECAST DATA ===`);
    console.log(`dailyForecast.length: ${dailyForecast.length}`);
    console.log(`dailyForecast[0].time: ${dailyForecast[0]?.time} (today)`);
    console.log(`dailyForecast[0] high/low: ${dailyForecast[0]?.tempMax}°/${dailyForecast[0]?.tempMin}°`);
    console.log(`dailyForecast.map(d => d.time): [${dailyForecast.map(d => d.time).join(', ')}]`);

    console.log(`\n=== 11TH DAY VERIFICATION (CRITICAL) ===`);
    console.log(`dailyForecast[10].time: ${eleventhDay?.time}`);
    console.log(`dailyForecast[10].tempMax: ${eleventhDay?.tempMax} (must be non-zero/real)`);
    console.log(`dailyForecast[10].tempMin: ${eleventhDay?.tempMin} (must be non-zero/real)`);
    console.log(`dailyForecast[10].code: ${eleventhDay?.code}`);

    // Check for null/empty
    const isEleventhDayReal =
      eleventhDay?.time &&
      eleventhDay?.tempMax !== 0 &&
      eleventhDay?.tempMin !== 0 &&
      typeof eleventhDay?.code === 'number';

    console.log(`\n✅ 11th day is REAL: ${isEleventhDayReal}`);

    if (!isEleventhDayReal) {
      console.error('\n❌ ERROR: 11th day is null/empty/invalid. DO NOT COMMIT.');
      process.exit(1);
    }

    console.log(`\n✅ ALL CHECKS PASS - Safe to commit\n`);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testExtendedForecast();
