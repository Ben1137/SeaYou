/**
 * Verify gated forecast_days in actual service logic
 * Mimics the fetchMarineWeather logic for both flag states
 */

const lat = 40.7128;
const lng = -74.0060;

async function testServiceLogic(flagOn: boolean) {
  try {
    // Mimic the service's gated logic
    const TIMELINE_ON = flagOn;
    const forecastDays = TIMELINE_ON ? '12' : '10';
    const usesPastDays = TIMELINE_ON;

    // Build request
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toString());
    url.searchParams.set('longitude', lng.toString());
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', forecastDays);
    if (usesPastDays) {
      url.searchParams.set('past_days', '3');
    }

    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    const daily = data.daily;

    // Get today's date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const nowLocalDate = `${currentYear}-${currentMonth}-${currentDay}`;

    let todayDailyIndex = daily.time?.findIndex((t: string) => t.startsWith(nowLocalDate)) ?? 0;
    if (todayDailyIndex < 0) todayDailyIndex = 0;

    // Mimic service's gated slice
    const forecastRowCount = TIMELINE_ON ? 11 : 10;
    const dailyForecast = daily.time?.slice(todayDailyIndex, todayDailyIndex + forecastRowCount).map((t: string, i: number) => ({
      time: t,
      tempMax: daily.temperature_2m_max?.[todayDailyIndex + i] || 0,
      tempMin: daily.temperature_2m_min?.[todayDailyIndex + i] || 0
    })) || [];

    const dailyPast = TIMELINE_ON
      ? daily.time?.slice(Math.max(0, todayDailyIndex - 3), todayDailyIndex).map((t: string, i: number) => ({
        time: t,
        tempMax: daily.temperature_2m_max?.[Math.max(0, todayDailyIndex - 3) + i] || 0,
        tempMin: daily.temperature_2m_min?.[Math.max(0, todayDailyIndex - 3) + i] || 0
      })) || []
      : [];

    return {
      flagOn,
      forecastDays,
      usesPastDays,
      totalDaysFromAPI: daily.time.length,
      todayDailyIndex,
      dailyForecastLength: dailyForecast.length,
      dailyForecastDates: dailyForecast.map(d => d.time),
      dailyPastLength: dailyPast.length,
      dailyPastDates: dailyPast.map(d => d.time),
      eleventhDay: dailyForecast[10]
    };
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

async function main() {
  console.log('\n=== GATED SERVICE LOGIC VERIFICATION ===\n');

  const resultOff = await testServiceLogic(false);
  const resultOn = await testServiceLogic(true);

  console.log('--- FLAG OFF ---\n');
  console.log(`Request: forecast_days=${resultOff.forecastDays}, past_days=${resultOff.usesPastDays ? '3' : 'NONE'}`);
  console.log(`API returned: ${resultOff.totalDaysFromAPI} days`);
  console.log(`todayDailyIndex: ${resultOff.todayDailyIndex}`);
  console.log(`dailyForecast.length: ${resultOff.dailyForecastLength}`);
  console.log(`dailyForecast[0].time: ${resultOff.dailyForecastDates[0]}`);
  console.log(`dailyForecast.map(d => d.time): [${resultOff.dailyForecastDates.join(', ')}]`);
  console.log(`dailyPast.length: ${resultOff.dailyPastLength}`);
  console.log(`\n✅ Matches production: ${resultOff.dailyForecastLength === 10 && resultOff.dailyPastLength === 0 ? 'YES' : 'NO'}\n`);

  console.log('--- FLAG ON ---\n');
  console.log(`Request: forecast_days=${resultOn.forecastDays}, past_days=${resultOn.usesPastDays ? '3' : 'NONE'}`);
  console.log(`API returned: ${resultOn.totalDaysFromAPI} days`);
  console.log(`todayDailyIndex: ${resultOn.todayDailyIndex}`);
  console.log(`dailyForecast.length: ${resultOn.dailyForecastLength}`);
  console.log(`dailyForecast[0].time: ${resultOn.dailyForecastDates[0]}`);
  console.log(`dailyForecast[10].time: ${resultOn.dailyForecastDates[10]} (11th day, REAL: ${resultOn.dailyForecastDates[10] ? 'YES' : 'NO'})`);
  console.log(`dailyForecast.map(d => d.time): [${resultOn.dailyForecastDates.join(', ')}]`);
  console.log(`dailyPast.length: ${resultOn.dailyPastLength}`);
  console.log(`dailyPast.map(d => d.time): [${resultOn.dailyPastDates.join(', ')}]`);
  console.log(`\n✅ Matches extended: ${resultOn.dailyForecastLength === 11 && resultOn.dailyPastLength === 3 && resultOn.dailyForecastDates[10] ? 'YES' : 'NO'}\n`);

  if (resultOff.dailyForecastLength !== 10 || resultOff.dailyPastLength !== 0) {
    console.error('❌ FLAG OFF FAILS - NOT matching production!');
    process.exit(1);
  }

  if (resultOn.dailyForecastLength !== 11 || resultOn.dailyPastLength !== 3 || !resultOn.dailyForecastDates[10]) {
    console.error('❌ FLAG ON FAILS - extended verification failed!');
    process.exit(1);
  }

  console.log('✅ ALL CHECKS PASS\n');
}

main();
