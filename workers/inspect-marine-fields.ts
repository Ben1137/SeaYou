/**
 * Inspect what fields marine endpoint actually returns
 */

const lat = 32.082;
const lng = 34.762;

async function inspectFields() {
  try {
    console.log('\n=== MARINE ENDPOINT FIELD INSPECTION ===\n');

    // Request with minimal params to see what's available
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toString());
    url.searchParams.set('longitude', lng.toString());
    url.searchParams.set('hourly', 'wave_height,wave_period,wind_speed_10m');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '1');

    console.log(`URL: ${url.toString()}\n`);

    const response = await fetch(url.toString());
    const data = (await response.json()) as any;

    console.log('Response keys:', Object.keys(data));
    if (data.hourly) {
      console.log('Hourly keys:', Object.keys(data.hourly));
      console.log('\nFirst few hourly rows:');
      if (data.hourly.time) {
        for (let i = 0; i < 3; i++) {
          const time = data.hourly.time[i];
          const h = data.hourly.wave_height?.[i];
          const p = data.hourly.wave_period?.[i];
          const w = data.hourly.wind_speed_10m?.[i];
          console.log(`  ${time}: wave_height=${h}, wave_period=${p}, wind_speed=${w}`);
        }
      }
    }

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

inspectFields();
