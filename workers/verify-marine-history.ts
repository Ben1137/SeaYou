/**
 * Verify marine past_days for wave height and period
 * Test: wave_height, wave_period hourly data with past_days=3
 */

const lat = 32.082;
const lng = 34.762;

async function testMarinePastDays() {
  try {
    console.log('\n=== MARINE past_days=3 VERIFICATION ===\n');

    // Build URL with past_days=3
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toString());
    url.searchParams.set('longitude', lng.toString());
    url.searchParams.set('hourly', 'wave_height,wave_period,swell_wave_height,swell_wave_period,wind_speed_10m');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '3');   // 3 days ahead
    url.searchParams.set('past_days', '3');       // 3 days back

    console.log(`URL: ${url.toString()}\n`);

    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    const hourly = data.hourly;

    if (!hourly || !hourly.time) {
      console.error('ERROR: No hourly data in response');
      process.exit(1);
    }

    // Get today's date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const nowLocalDate = `${currentYear}-${currentMonth}-${currentDay}`;

    console.log(`Today's local date: ${nowLocalDate}`);
    console.log(`API returned ${hourly.time.length} total hourly points\n`);

    // Find today's first hour index
    let todayHourIndex = hourly.time?.findIndex((t: string) => t.startsWith(nowLocalDate)) ?? 0;
    if (todayHourIndex < 0) todayHourIndex = 0;

    console.log(`todayHourIndex (first hour of today): ${todayHourIndex}`);
    console.log(`Timestamp at todayHourIndex: ${hourly.time[todayHourIndex]}\n`);

    // Extract past window: 72 hours before today (3 days * 24 hours)
    const pastStart = Math.max(0, todayHourIndex - 72);
    const pastEnd = todayHourIndex;
    const pastWindow = hourly.time.slice(pastStart, pastEnd);

    console.log(`=== PAST WINDOW (${pastWindow.length} hours) ===`);
    console.log(`First: ${pastWindow[0]}`);
    console.log(`Last:  ${pastWindow[pastWindow.length - 1]}\n`);

    // Sample: oldest past
    const oldestIdx = pastStart;
    const oldestWaveHeight = hourly.wave_height?.[oldestIdx];
    const oldestWavePeriod = hourly.wave_period?.[oldestIdx];

    console.log(`OLDEST PAST (index ${oldestIdx}, ${hourly.time[oldestIdx]}):`);
    console.log(`  wave_height: ${oldestWaveHeight}`);
    console.log(`  wave_period: ${oldestWavePeriod}`);
    console.log(`  wave_height is null: ${oldestWaveHeight === null || oldestWaveHeight === undefined}`);
    console.log(`  wave_period is null: ${oldestWavePeriod === null || oldestWavePeriod === undefined}\n`);

    // Sample: seam (now boundary)
    const seamIdx = todayHourIndex;
    const seamWaveHeight = hourly.wave_height?.[seamIdx];
    const seamWavePeriod = hourly.wave_period?.[seamIdx];

    console.log(`SEAM (now boundary, index ${seamIdx}, ${hourly.time[seamIdx]}):`);
    console.log(`  wave_height: ${seamWaveHeight}`);
    console.log(`  wave_period: ${seamWavePeriod}`);
    console.log(`  wave_height is null: ${seamWaveHeight === null || seamWaveHeight === undefined}`);
    console.log(`  wave_period is null: ${seamWavePeriod === null || seamWavePeriod === undefined}\n`);

    // Sample: forecast (12 hours ahead)
    const forecastIdx = todayHourIndex + 12;
    const forecastWaveHeight = hourly.wave_height?.[forecastIdx];
    const forecastWavePeriod = hourly.wave_period?.[forecastIdx];

    console.log(`FORECAST +12h (index ${forecastIdx}, ${hourly.time[forecastIdx]}):`);
    console.log(`  wave_height: ${forecastWaveHeight}`);
    console.log(`  wave_period: ${forecastWavePeriod}`);
    console.log(`  wave_height is null: ${forecastWaveHeight === null || forecastWaveHeight === undefined}`);
    console.log(`  wave_period is null: ${forecastWavePeriod === null || forecastWavePeriod === undefined}\n`);

    // Check for nulls in past window
    let pastNullCount = 0;
    let pastNullIndices: number[] = [];
    for (let i = pastStart; i < pastEnd; i++) {
      const h = hourly.wave_height?.[i];
      const p = hourly.wave_period?.[i];
      if (h === null || h === undefined || p === null || p === undefined) {
        pastNullCount++;
        pastNullIndices.push(i);
      }
    }

    console.log(`=== PAST NULL CHECK ===`);
    console.log(`Null entries in past window: ${pastNullCount} / ${pastWindow.length}`);
    if (pastNullIndices.length > 0 && pastNullIndices.length <= 10) {
      console.log(`Null at indices: ${pastNullIndices.join(', ')}`);
    }

    // Overall summary
    console.log(`\n=== SUMMARY ===`);
    console.log(`Past window length: ${pastWindow.length} hours (3 days)`);
    console.log(`Past data quality: ${pastNullCount === 0 ? '✅ CLEAN (no nulls)' : `⚠️ ${pastNullCount} nulls detected`}`);
    console.log(`Seam (now) has data: ${seamWaveHeight !== null && seamWaveHeight !== undefined && seamWavePeriod !== null && seamWavePeriod !== undefined ? '✅ YES' : '❌ NO'}`);

    if (pastNullCount > 0) {
      console.error(`\n⚠️ NULLS DETECTED IN PAST — may affect history rendering`);
    }

    console.log(`\n✅ VERIFICATION COMPLETE\n`);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testMarinePastDays();
