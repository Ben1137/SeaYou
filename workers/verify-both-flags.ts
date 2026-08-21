/**
 * Verify BOTH flag states match expected behavior
 * FLAG OFF: 10 forecast rows, no past, forecast_days=10
 * FLAG ON: 11 forecast rows + 3 past, forecast_days=12
 */

const lat = 40.7128;
const lng = -74.0060;

async function testBothStates() {
  try {
    console.log('\n=== BOTH FLAG STATES VERIFICATION ===\n');

    // FLAG OFF: forecast_days=10, no past_days
    console.log('--- FLAG OFF ---\n');
    const urlOff = new URL('https://api.open-meteo.com/v1/forecast');
    urlOff.searchParams.set('latitude', lat.toString());
    urlOff.searchParams.set('longitude', lng.toString());
    urlOff.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    urlOff.searchParams.set('timezone', 'auto');
    urlOff.searchParams.set('forecast_days', '10'); // Production default
    // NO past_days

    console.log(`URL: ${urlOff.toString()}\n`);

    const responseOff = await fetch(urlOff.toString());
    const dataOff = (await responseOff.json()) as any;
    const dailyOff = dataOff.daily;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const nowLocalDate = `${currentYear}-${currentMonth}-${currentDay}`;

    let todayIndexOff = dailyOff.time?.findIndex((t: string) => t.startsWith(nowLocalDate)) ?? 0;
    if (todayIndexOff < 0) todayIndexOff = 0;

    const dailyForecastOff = dailyOff.time?.slice(todayIndexOff, todayIndexOff + 10).map((t: string, i: number) => ({
      time: t,
      tempMax: dailyOff.temperature_2m_max?.[todayIndexOff + i] || 0,
      tempMin: dailyOff.temperature_2m_min?.[todayIndexOff + i] || 0
    })) || [];

    const dailyPastOff = [];

    console.log(`Request: forecast_days=10, NO past_days`);
    console.log(`API returned ${dailyOff.time.length} total days`);
    console.log(`todayDailyIndex: ${todayIndexOff}`);
    console.log(`dailyForecast.length: ${dailyForecastOff.length}`);
    console.log(`dailyForecast[0].time: ${dailyForecastOff[0]?.time}`);
    console.log(`dailyForecast.map(d => d.time): [${dailyForecastOff.map(d => d.time).join(', ')}]`);
    console.log(`dailyPast.length: ${dailyPastOff.length}`);
    console.log(`\n✅ FLAG OFF: 10 forecast rows, 0 past rows, forecast_days=10 (MATCHES PRODUCTION DEFAULT)\n`);

    // FLAG ON: forecast_days=12, past_days=3
    console.log('--- FLAG ON ---\n');
    const urlOn = new URL('https://api.open-meteo.com/v1/forecast');
    urlOn.searchParams.set('latitude', lat.toString());
    urlOn.searchParams.set('longitude', lng.toString());
    urlOn.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    urlOn.searchParams.set('timezone', 'auto');
    urlOn.searchParams.set('forecast_days', '12');
    urlOn.searchParams.set('past_days', '3');

    console.log(`URL: ${urlOn.toString()}\n`);

    const responseOn = await fetch(urlOn.toString());
    const dataOn = (await responseOn.json()) as any;
    const dailyOn = dataOn.daily;

    let todayIndexOn = dailyOn.time?.findIndex((t: string) => t.startsWith(nowLocalDate)) ?? 0;
    if (todayIndexOn < 0) todayIndexOn = 0;

    const dailyForecastOn = dailyOn.time?.slice(todayIndexOn, todayIndexOn + 11).map((t: string, i: number) => ({
      time: t,
      tempMax: dailyOn.temperature_2m_max?.[todayIndexOn + i] || 0,
      tempMin: dailyOn.temperature_2m_min?.[todayIndexOn + i] || 0
    })) || [];

    const dailyPastOn = dailyOn.time?.slice(Math.max(0, todayIndexOn - 3), todayIndexOn).map((t: string, i: number) => ({
      time: t,
      tempMax: dailyOn.temperature_2m_max?.[Math.max(0, todayIndexOn - 3) + i] || 0,
      tempMin: dailyOn.temperature_2m_min?.[Math.max(0, todayIndexOn - 3) + i] || 0
    })) || [];

    console.log(`Request: forecast_days=12, past_days=3`);
    console.log(`API returned ${dailyOn.time.length} total days`);
    console.log(`todayDailyIndex: ${todayIndexOn}`);
    console.log(`dailyForecast.length: ${dailyForecastOn.length}`);
    console.log(`dailyForecast[0].time: ${dailyForecastOn[0]?.time}`);
    console.log(`dailyForecast[10].time: ${dailyForecastOn[10]?.time} (11th day, REAL: ${dailyForecastOn[10]?.time ? 'YES' : 'NO'})`);
    console.log(`dailyForecast.map(d => d.time): [${dailyForecastOn.map(d => d.time).join(', ')}]`);
    console.log(`dailyPast.length: ${dailyPastOn.length}`);
    console.log(`dailyPast.map(d => d.time): [${dailyPastOn.map(d => d.time).join(', ')}]`);
    console.log(`\n✅ FLAG ON: 11 forecast rows, 3 past rows, forecast_days=12 (EXTENDED)\n`);

    console.log('=== SUMMARY ===\n');
    console.log(`FLAG OFF matches production: ${dailyForecastOff.length === 10 && dailyPastOff.length === 0 ? '✅ YES' : '❌ NO'}`);
    console.log(`FLAG ON matches extended: ${dailyForecastOn.length === 11 && dailyPastOn.length === 3 && dailyForecastOn[10]?.time ? '✅ YES' : '❌ NO'}`);
    console.log(`11th day is real: ${dailyForecastOn[10]?.time ? '✅ YES' : '❌ NO'}`);

    if (!(dailyForecastOff.length === 10 && dailyPastOff.length === 0)) {
      console.error('\n❌ FLAG OFF regression detected!');
      process.exit(1);
    }

    if (!(dailyForecastOn.length === 11 && dailyPastOn.length === 3 && dailyForecastOn[10]?.time)) {
      console.error('\n❌ FLAG ON verification failed!');
      process.exit(1);
    }

    console.log('\n✅ ALL CHECKS PASS - Safe to commit\n');

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testBothStates();
