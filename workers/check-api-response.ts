const lat = 40.7128;
const lng = -74.0060;

async function checkAPI() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code&timezone=auto&forecast_days=11&past_days=3`;

  const response = await fetch(url);
  const data = (await response.json()) as any;

  console.log(`API response daily.time array length: ${data.daily.time?.length}`);
  console.log(`First date: ${data.daily.time?.[0]}`);
  console.log(`Last date: ${data.daily.time?.[data.daily.time.length - 1]}`);
  console.log(`Full array: [${data.daily.time?.slice(0, 15).join(', ')}${data.daily.time?.length > 15 ? ', ...' : ''}]`);
}

checkAPI();
