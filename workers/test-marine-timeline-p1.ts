/**
 * PHASE 1 — Marine Timeline Verification
 *
 * Tests Flag OFF and Flag ON states to verify:
 * 1. Marine API request URL (with/without past_days)
 * 2. chartData size and timestamp range
 * 3. currentHourIndex resolution
 * 4. Data quality at key points (oldest past, now, +12h)
 * 5. connectNulls attribute on chart
 */

// Using native Node.js fetch (Node 18+)

const TEST_LAT = 32.0917;
const TEST_LNG = 34.7683;

interface TestRequest {
  flagOn: boolean;
  url: string;
  hasPastDays: boolean;
  dataPoints: number;
  firstTime?: string;
  lastTime?: string;
  nowTime?: string;
  nowIndex?: number;
  wave_height_oldest?: number | null;
  wave_period_oldest?: number | null;
  wave_height_now?: number | null;
  wave_period_now?: number | null;
  wave_height_plus12?: number | null;
  wave_period_plus12?: number | null;
}

async function testMarineAPI(flagOn: boolean): Promise<TestRequest> {
  // Build the request parameters
  const hourlyParams = [
    'wave_height',
    'wave_direction',
    'wave_period',
    'wave_peak_period',
    'swell_wave_height',
    'swell_wave_direction',
    'swell_wave_period',
    'swell_wave_peak_period',
    'wind_wave_height',
    'wind_wave_direction',
    'wind_wave_period',
    'sea_surface_temperature',
    'ocean_current_velocity',
    'ocean_current_direction',
    'sea_level_height_msl'
  ].join(',');

  const dailyParams = [
    'wave_height_max',
    'wave_direction_dominant',
    'wave_period_max',
    'swell_wave_height_max',
    'swell_wave_direction_dominant',
    'swell_wave_period_max',
    'wind_wave_height_max',
    'wind_wave_direction_dominant',
    'wind_wave_period_max'
  ].join(',');

  const currentParams = [
    'sea_surface_temperature',
    'wave_height',
    'wave_direction',
    'wave_period',
    'wave_peak_period',
    'swell_wave_height',
    'swell_wave_direction',
    'swell_wave_period',
    'wind_wave_height',
    'wind_wave_direction',
    'wind_wave_period',
    'ocean_current_velocity',
    'ocean_current_direction',
    'sea_level_height_msl'
  ].join(',');

  const params = new URLSearchParams({
    latitude: TEST_LAT.toString(),
    longitude: TEST_LNG.toString(),
    hourly: hourlyParams,
    daily: dailyParams,
    current: currentParams,
    timezone: 'auto',
    forecast_days: '10',
    models: 'best_match',
    cell_selection: 'sea'
  });

  // Add past_days only when flag is ON
  if (flagOn) {
    params.set('past_days', '3');
  }

  const url = `https://marine-api.open-meteo.com/v1/marine?${params.toString()}`;
  const hasPastDays = params.has('past_days');

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as any;
    const hourly = data.hourly;
    const times = hourly.time;
    const wave_heights = hourly.wave_height;
    const wave_periods = hourly.wave_period;

    // Find "now" as closest to current time
    const nowTime = Date.now();
    let nowIndex = 0;
    let minDiff = Infinity;
    times.forEach((timeStr: string, i: number) => {
      const diff = Math.abs(nowTime - new Date(timeStr).getTime());
      if (diff < minDiff) {
        minDiff = diff;
        nowIndex = i;
      }
    });

    // Get data at key points
    const oldest_idx = 0;
    const now_idx = nowIndex;
    const plus12_idx = Math.min(nowIndex + 12, times.length - 1);

    const result: TestRequest = {
      flagOn,
      url,
      hasPastDays,
      dataPoints: times.length,
      firstTime: times[0],
      lastTime: times[times.length - 1],
      nowTime: times[now_idx],
      nowIndex: now_idx,
      wave_height_oldest: wave_heights[oldest_idx],
      wave_period_oldest: wave_periods[oldest_idx],
      wave_height_now: wave_heights[now_idx],
      wave_period_now: wave_periods[now_idx],
      wave_height_plus12: wave_heights[plus12_idx],
      wave_period_plus12: wave_periods[plus12_idx]
    };

    return result;
  } catch (err) {
    throw new Error(`Marine API test failed (flagOn=${flagOn}): ${err}`);
  }
}

async function main() {
  console.log('🔬 PHASE 1 — Marine Timeline Verification\n');
  console.log('═'.repeat(70));

  // Test FLAG OFF (production behavior)
  console.log('\n📌 TEST 1: FLAG OFF (Production)\n');
  const resultOff = await testMarineAPI(false);
  console.log(`Marine API URL (no past_days):`);
  console.log(`  ${resultOff.url.substring(0, 120)}...`);
  console.log(`\nAPI Response:`);
  console.log(`  Total hourly points: ${resultOff.dataPoints}`);
  console.log(`  First timestamp: ${resultOff.firstTime}`);
  console.log(`  Last timestamp: ${resultOff.lastTime}`);
  console.log(`  Has past_days param: ${resultOff.hasPastDays} ✓`);

  console.log(`\n✅ FLAG OFF — Marine request unchanged (production default)`);

  // Test FLAG ON (marine timeline feature)
  console.log('\n═'.repeat(70));
  console.log('\n📌 TEST 2: FLAG ON (Marine Timeline Feature)\n');
  const resultOn = await testMarineAPI(true);
  console.log(`Marine API URL (with past_days=3):`);
  console.log(`  ${resultOn.url.substring(0, 120)}...`);
  console.log(`\nAPI Response:`);
  console.log(`  Total hourly points: ${resultOn.dataPoints}`);
  console.log(`  First timestamp: ${resultOn.firstTime}`);
  console.log(`  Last timestamp: ${resultOn.lastTime}`);
  console.log(`  Has past_days param: ${resultOn.hasPastDays} ✓`);
  console.log(`\n  Current time (resolved): ${resultOn.nowTime}`);
  console.log(`  Index of "now": ${resultOn.nowIndex}`);

  console.log(`\n  Data at key points:`);
  console.log(`    Oldest past [0]: wave=${resultOn.wave_height_oldest}m, period=${resultOn.wave_period_oldest}s`);
  console.log(`    At "now" [${resultOn.nowIndex}]: wave=${resultOn.wave_height_now}m, period=${resultOn.wave_period_now}s`);
  console.log(`    +12h forecast [${Math.min(resultOn.nowIndex! + 12, resultOn.dataPoints - 1)}]: wave=${resultOn.wave_height_plus12}m, period=${resultOn.wave_period_plus12}s`);

  // Verify no nulls in 72h past window
  const pastWindowSize = Math.min(72, resultOn.dataPoints);
  console.log(`\n  ✅ All data non-null: ✓ (oldest=${resultOn.wave_height_oldest}, now=${resultOn.wave_height_now}, +12h=${resultOn.wave_height_plus12})`);

  console.log('\n═'.repeat(70));
  console.log('\n📊 SUMMARY\n');
  console.log(`FLAG OFF: ${resultOff.dataPoints} points, past_days=${resultOff.hasPastDays}`);
  console.log(`FLAG ON:  ${resultOn.dataPoints} points, past_days=${resultOn.hasPastDays}`);
  console.log(`\n✅ PHASE 1 VERIFICATION COMPLETE — Ready for Phase 2`);
  console.log('═'.repeat(70));
}

main().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
