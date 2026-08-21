/**
 * Test marine past_days with Tel Aviv (likely has better coastal data)
 */

const lat = 32.0917;  // Tel Aviv
const lng = 34.7683;

async function testMarinePastDaysValid() {
  try {
    console.log('\n=== MARINE past_days=3 (Tel Aviv) ===\n');

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toString());
    url.searchParams.set('longitude', lng.toString());
    url.searchParams.set('hourly', 'wave_height,wave_period,swell_wave_height,swell_wave_period,wind_speed_10m');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '3');
    url.searchParams.set('past_days', '3');

    console.log(`Location: ${lat}, ${lng} (Tel Aviv)\n`);

    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    const hourly = data.hourly;

    if (!hourly?.time) {
      console.error('ERROR: No hourly data');
      process.exit(1);
    }

    console.log(`Total points: ${hourly.time.length}\n`);

    // Find today
    const now = new Date();
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    let todayIdx = hourly.time.findIndex((t: string) => t.startsWith(todayStr)) ?? 0;
    if (todayIdx < 0) todayIdx = 0;

    console.log(`Today: ${todayStr}, first hour at index ${todayIdx}`);
    console.log(`Time at todayIdx: ${hourly.time[todayIdx]}\n`);

    // Past window
    const pastStart = Math.max(0, todayIdx - 72);
    console.log(`=== PAST (indices ${pastStart}-${todayIdx - 1}) ===`);
    console.log(`First: ${hourly.time[pastStart]}`);
    console.log(`Last:  ${hourly.time[todayIdx - 1]}\n`);

    // Sample: oldest
    const oldH = hourly.wave_height?.[pastStart];
    const oldP = hourly.wave_period?.[pastStart];
    console.log(`Oldest past (${hourly.time[pastStart]}):`);
    console.log(`  wave_height: ${oldH}, is null: ${oldH === null}`);
    console.log(`  wave_period: ${oldP}, is null: ${oldP === null}\n`);

    // Sample: seam
    const seamH = hourly.wave_height?.[todayIdx];
    const seamP = hourly.wave_period?.[todayIdx];
    console.log(`Seam (${hourly.time[todayIdx]}):`);
    console.log(`  wave_height: ${seamH}, is null: ${seamH === null}`);
    console.log(`  wave_period: ${seamP}, is null: ${seamP === null}\n`);

    // Sample: +12h forecast
    const fcIdx = todayIdx + 12;
    const fcH = hourly.wave_height?.[fcIdx];
    const fcP = hourly.wave_period?.[fcIdx];
    console.log(`Forecast +12h (${hourly.time[fcIdx]}):`);
    console.log(`  wave_height: ${fcH}, is null: ${fcH === null}`);
    console.log(`  wave_period: ${fcP}, is null: ${fcP === null}\n`);

    // Count nulls in past
    let nullCount = 0;
    for (let i = pastStart; i < todayIdx; i++) {
      if ((hourly.wave_height?.[i] ?? null) === null || (hourly.wave_period?.[i] ?? null) === null) {
        nullCount++;
      }
    }

    console.log(`Past nulls: ${nullCount} / ${todayIdx - pastStart} hours`);
    console.log(`\n${nullCount === 0 ? '✅ PAST DATA CLEAN' : '⚠️ NULLS PRESENT'}\n`);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testMarinePastDaysValid();
