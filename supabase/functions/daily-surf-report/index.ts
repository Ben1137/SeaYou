/**
 * daily-surf-report — Supabase Edge Function (Deno runtime)
 * ----------------------------------------------------------
 * Triggered once a day by a pg_cron job (see
 * supabase/migrations/*_add_daily_push_cron.sql). For every user in
 * `user_preferences` that has:
 *   • a saved home location (lat/lon)
 *   • an onboarding persona (wave_surfer | wind_surfer | kite_surfer |
 *                           sailor | diver | beachgoer)
 *   • a OneSignal player ID (push handle)
 *
 * …we:
 *   1. Fetch today's hourly marine + weather forecast from Open-Meteo
 *      (free, no API key needed).
 *   2. Run every forecast hour through the shared @seame/core
 *      activityScoring engine for that user's persona.
 *   3. Find the single highest-scoring hour of the day.
 *   4. If that peak score is >= 75 ("Good" or better), craft a
 *      persona-tailored teaser ("Epic conditions at 13:00! Should I save a
 *      wave for you?") and push it via the OneSignal REST API.
 *
 * Design principles:
 *   • Modular — each concern (DB read, forecast fetch, scoring, push send)
 *     is isolated in its own function and unit-testable.
 *   • Resilient — one bad user can't take down the whole batch. All
 *     per-user errors are caught and logged; the loop keeps going.
 *   • Idempotent-ish — we don't double-send within a run. We do NOT
 *     attempt to dedupe across multiple invocations in the same day; the
 *     CRON job is expected to fire exactly once per day at 06:00 UTC.
 *
 * Required env vars (Supabase → Project → Edge Functions → Secrets):
 *   SUPABASE_URL              — auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected; lets us bypass RLS to read
 *                               every row in user_preferences
 *   ONESIGNAL_APP_ID          — OneSignal application ID
 *   ONESIGNAL_REST_API_KEY    — OneSignal REST API key (server secret)
 *
 * Local invocation (for testing):
 *   supabase functions serve daily-surf-report
 *   curl -X POST http://localhost:54321/functions/v1/daily-surf-report \
 *        -H "Authorization: Bearer <anon-key>"
 */

// deno-lint-ignore-file no-explicit-any
// @ts-ignore — Deno std import, resolved at Supabase runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── Types ─────────────────────────────────────────────────────────────────

type Persona =
  | 'wave_surfer'
  | 'wind_surfer'
  | 'kite_surfer'
  | 'sailor'
  | 'diver'
  | 'beachgoer';

interface UserRow {
  user_id: string;
  home_lat: number | null;
  home_lon: number | null;
  persona: Persona | null;
  onesignal_player_id: string | null;
  locale: string | null;
}

interface HourlyConditions {
  time: string;
  waveHeight: number;
  wavePeriod: number;
  swellHeight: number;
  swellPeriod: number;
  swellDirection: number;
  windSpeed: number;
  windGusts: number;
  windDirection: number;
  windWaveHeight?: number;
  currentSpeed?: number;
  currentDirection?: number;
  seaTemp?: number;
  visibility?: number;
  uvIndex?: number;
  weatherCode?: number;
  pressure?: number;
  isDay?: boolean;
}

interface PeakResult {
  peakScore: number;
  peakHour: string; // ISO timestamp
  peakLocalLabel: string; // "13:00"
}

// ─── Supabase client (service-role — bypasses RLS to read every user) ──────

function getSupabase() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// ─── Step 1: Fetch all users who opted in to push notifications ────────────

async function fetchEligibleUsers(): Promise<UserRow[]> {
  const sb = getSupabase();
  // Assume user_preferences will soon carry these columns:
  //   home_lat, home_lon, persona, onesignal_player_id, locale
  // A user is eligible when all four non-null are present. Locale is
  // optional — falls back to 'en'.
  const { data, error } = await sb
    .from('user_preferences')
    .select('user_id, home_lat, home_lon, persona, onesignal_player_id, locale')
    .not('home_lat', 'is', null)
    .not('home_lon', 'is', null)
    .not('persona', 'is', null)
    .not('onesignal_player_id', 'is', null);

  if (error) {
    console.error('[daily-surf-report] Failed to query user_preferences:', error);
    return [];
  }
  return (data ?? []) as UserRow[];
}

// ─── Step 2: Open-Meteo forecast fetch ─────────────────────────────────────

/**
 * Pull today's hourly marine + weather forecast for (lat, lon) from
 * Open-Meteo. Two endpoints, fused into the shape the scoring engine
 * expects. Free, no key.
 */
async function fetchTodayForecast(
  lat: number,
  lon: number,
): Promise<HourlyConditions[]> {
  const marineUrl = new URL('https://marine-api.open-meteo.com/v1/marine');
  marineUrl.searchParams.set('latitude', String(lat));
  marineUrl.searchParams.set('longitude', String(lon));
  marineUrl.searchParams.set(
    'hourly',
    [
      'wave_height',
      'wave_period',
      'swell_wave_height',
      'swell_wave_period',
      'swell_wave_direction',
      'wind_wave_height',
      'ocean_current_velocity',
      'ocean_current_direction',
      'sea_surface_temperature',
    ].join(','),
  );
  marineUrl.searchParams.set('forecast_days', '1');

  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
  weatherUrl.searchParams.set('latitude', String(lat));
  weatherUrl.searchParams.set('longitude', String(lon));
  weatherUrl.searchParams.set(
    'hourly',
    [
      'wind_speed_10m',
      'wind_gusts_10m',
      'wind_direction_10m',
      'visibility',
      'uv_index',
      'weather_code',
      'pressure_msl',
      'is_day',
    ].join(','),
  );
  weatherUrl.searchParams.set('forecast_days', '1');
  weatherUrl.searchParams.set('wind_speed_unit', 'kmh');

  const [marineResp, weatherResp] = await Promise.all([
    fetch(marineUrl.toString()),
    fetch(weatherUrl.toString()),
  ]);
  if (!marineResp.ok || !weatherResp.ok) {
    throw new Error(
      `Open-Meteo fetch failed: marine=${marineResp.status} weather=${weatherResp.status}`,
    );
  }
  const marine = await marineResp.json();
  const weather = await weatherResp.json();

  const times: string[] = weather?.hourly?.time ?? [];
  const out: HourlyConditions[] = [];
  for (let i = 0; i < times.length; i++) {
    out.push({
      time: times[i],
      waveHeight: marine?.hourly?.wave_height?.[i] ?? 0,
      wavePeriod: marine?.hourly?.wave_period?.[i] ?? 0,
      swellHeight: marine?.hourly?.swell_wave_height?.[i] ?? 0,
      swellPeriod: marine?.hourly?.swell_wave_period?.[i] ?? 0,
      swellDirection: marine?.hourly?.swell_wave_direction?.[i] ?? 0,
      windWaveHeight: marine?.hourly?.wind_wave_height?.[i] ?? 0,
      currentSpeed: marine?.hourly?.ocean_current_velocity?.[i] ?? undefined,
      currentDirection: marine?.hourly?.ocean_current_direction?.[i] ?? undefined,
      seaTemp: marine?.hourly?.sea_surface_temperature?.[i] ?? undefined,
      windSpeed: weather?.hourly?.wind_speed_10m?.[i] ?? 0,
      windGusts: weather?.hourly?.wind_gusts_10m?.[i] ?? 0,
      windDirection: weather?.hourly?.wind_direction_10m?.[i] ?? 0,
      visibility: weather?.hourly?.visibility?.[i] ?? undefined,
      uvIndex: weather?.hourly?.uv_index?.[i] ?? undefined,
      weatherCode: weather?.hourly?.weather_code?.[i] ?? undefined,
      pressure: weather?.hourly?.pressure_msl?.[i] ?? undefined,
      isDay: weather?.hourly?.is_day?.[i] === 1,
    });
  }
  return out;
}

// ─── Step 3: Scoring (mirror of @seame/core/scoring) ───────────────────────
// NOTE: Deno Edge Functions can't directly import our monorepo package, so we
// duplicate a lean version of the scoring primitives here. If the canonical
// algorithm changes in packages/core, mirror the change below or publish
// @seame/core as a standalone module and import via esm.sh.

function sweetSpotScore(
  v: number,
  minBad: number,
  minGood: number,
  maxGood: number,
  maxBad: number,
): number {
  if (v <= minBad || v >= maxBad) return 0;
  if (v >= minGood && v <= maxGood) return 100;
  if (v < minGood) return Math.round(((v - minBad) / (minGood - minBad)) * 100);
  return Math.round(((maxBad - v) / (maxBad - maxGood)) * 100);
}

function weatherBonus(code: number | undefined): number {
  if (code === undefined) return 70;
  if (code === 0) return 100;
  if (code <= 3) return 85;
  if (code <= 48) return 60;
  if (code <= 67) return 40;
  if (code >= 95) return 0;
  return 55;
}

function gustSafety(wind: number, gust: number): number {
  const delta = gust - wind;
  if (delta <= 5) return 100;
  if (delta <= 10) return 80;
  if (delta <= 15) return 55;
  if (delta <= 25) return 25;
  return 0;
}

function chopIndex(windWave: number, swell: number): number {
  if (swell <= 0) return 1;
  return Math.min(1, windWave / swell);
}

/**
 * Persona-aware scorer. Returns 0-100. Mirrors the weighted sum in
 * packages/core/src/scoring/personas.ts — keep in sync.
 */
function scoreForPersona(p: Persona, c: HourlyConditions): number {
  switch (p) {
    case 'wave_surfer': {
      const s = {
        sh: sweetSpotScore(c.swellHeight, 0.3, 1.0, 2.5, 4.0),
        sp: sweetSpotScore(c.swellPeriod, 4, 8, 14, 20),
        w: sweetSpotScore(c.windSpeed, 0, 5, 15, 35),
        ch: (1 - chopIndex(c.windWaveHeight || 0, c.swellHeight)) * 100,
        wx: weatherBonus(c.weatherCode),
      };
      return s.sh * 0.35 + s.sp * 0.25 + s.w * 0.2 + s.ch * 0.1 + s.wx * 0.1;
    }
    case 'wind_surfer': {
      const s = {
        w: sweetSpotScore(c.windSpeed, 12, 20, 35, 55),
        g: gustSafety(c.windSpeed, c.windGusts),
        wh: sweetSpotScore(c.waveHeight, 0, 0.5, 2.0, 3.5),
        st: c.seaTemp !== undefined ? sweetSpotScore(c.seaTemp, 10, 18, 28, 35) : 70,
      };
      return s.w * 0.4 + s.g * 0.3 + s.wh * 0.2 + s.st * 0.1;
    }
    case 'kite_surfer': {
      const gd = c.windGusts - c.windSpeed;
      const s = {
        w: sweetSpotScore(c.windSpeed, 10, 15, 30, 45),
        gd: sweetSpotScore(gd, 0, 0, 10, 20),
        wh: sweetSpotScore(c.waveHeight, 0, 0.3, 1.5, 3.0),
        wx: c.weatherCode !== undefined && c.weatherCode >= 95 ? 0 : weatherBonus(c.weatherCode),
      };
      return s.w * 0.5 + s.gd * 0.2 + s.wh * 0.2 + s.wx * 0.1;
    }
    case 'sailor': {
      const visNm = (c.visibility || 10000) / 1852;
      const s = {
        w: sweetSpotScore(c.windSpeed, 0, 10, 25, 45),
        wh: sweetSpotScore(c.waveHeight, 0, 0, 2.0, 4.0),
        v: sweetSpotScore(visNm, 1, 5, 20, 30),
        g: gustSafety(c.windSpeed, c.windGusts),
      };
      return s.w * 0.35 + s.wh * 0.3 + s.v * 0.2 + s.g * 0.15;
    }
    case 'diver': {
      const s = {
        v: sweetSpotScore(c.visibility || 10000, 2000, 8000, 20000, 30000),
        wh: sweetSpotScore(c.waveHeight, 0, 0, 0.8, 1.5),
        cs: sweetSpotScore(c.currentSpeed || 0, 0, 0, 0.3, 1.0),
        st: c.seaTemp !== undefined ? sweetSpotScore(c.seaTemp, 14, 22, 28, 32) : 70,
      };
      return s.v * 0.35 + s.wh * 0.25 + s.cs * 0.25 + s.st * 0.15;
    }
    case 'beachgoer': {
      if (c.isDay === false) return 10; // night cap
      const s = {
        wx: weatherBonus(c.weatherCode),
        w: sweetSpotScore(c.windSpeed, 0, 0, 15, 30),
        wh: sweetSpotScore(c.waveHeight, 0, 0, 0.5, 1.5),
        st: c.seaTemp !== undefined ? sweetSpotScore(c.seaTemp, 16, 22, 30, 35) : 70,
      };
      return s.wx * 0.35 + s.w * 0.3 + s.wh * 0.2 + s.st * 0.15;
    }
  }
}

/**
 * Find the single best hour of the day for a given persona.
 * Returns null if the feed was empty (no forecast data for the region).
 */
function findPeakHour(p: Persona, hours: HourlyConditions[]): PeakResult | null {
  if (hours.length === 0) return null;
  let best = { score: -1, hour: hours[0] };
  for (const h of hours) {
    const s = scoreForPersona(p, h);
    if (s > best.score) best = { score: s, hour: h };
  }
  // Local-ish label — Open-Meteo returns ISO without offset; "HH:MM" is safe.
  const hh = best.hour.time.slice(11, 16);
  return {
    peakScore: Math.round(Math.max(0, Math.min(100, best.score))),
    peakHour: best.hour.time,
    peakLocalLabel: hh,
  };
}

// ─── Step 4: Compose persona-tailored copy ─────────────────────────────────

function buildMessage(p: Persona, peak: PeakResult): { title: string; body: string } {
  const qualifier = peak.peakScore >= 90 ? 'Epic' : 'Great';
  const hook: Record<Persona, string> = {
    wave_surfer:
      `${qualifier} conditions today at ${peak.peakLocalLabel}! Should I save a wave for you?`,
    wind_surfer:
      `${qualifier} wind today at ${peak.peakLocalLabel} — time to rig up?`,
    kite_surfer:
      `${qualifier} kiteable window today at ${peak.peakLocalLabel}! Want me to hold it?`,
    sailor:
      `${qualifier} sailing window opens at ${peak.peakLocalLabel}. Shall I plot the course?`,
    diver:
      `${qualifier} visibility and calm seas at ${peak.peakLocalLabel}. Dive today?`,
    beachgoer:
      `${qualifier} beach weather peaks at ${peak.peakLocalLabel}. Pack the towels?`,
  };
  const titleByScore =
    peak.peakScore >= 90
      ? '🌊 Epic conditions ahead'
      : '🌊 Great conditions today';
  return { title: titleByScore, body: hook[p] };
}

// ─── Step 5: Push via OneSignal REST API ───────────────────────────────────

async function sendPush(
  playerId: string,
  title: string,
  body: string,
): Promise<void> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
  if (!appId || !apiKey) {
    throw new Error('Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY');
  }

  const resp = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // OneSignal REST keys use the "Basic" auth scheme despite being
      // bearer-style secrets — this is per their documentation.
      'Authorization': `Basic ${apiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      include_player_ids: [playerId],
      headings: { en: title },
      contents: { en: body },
      // Channel hints — OneSignal iOS / Android will pick the right one.
      ios_badgeType: 'Increase',
      ios_badgeCount: 1,
      priority: 10,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OneSignal ${resp.status}: ${text}`);
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────

interface RunStats {
  totalUsers: number;
  pushesSent: number;
  skippedLowScore: number;
  skippedNoForecast: number;
  errors: number;
}

async function runDailySurfReport(): Promise<RunStats> {
  const stats: RunStats = {
    totalUsers: 0,
    pushesSent: 0,
    skippedLowScore: 0,
    skippedNoForecast: 0,
    errors: 0,
  };

  const users = await fetchEligibleUsers();
  stats.totalUsers = users.length;
  console.log(`[daily-surf-report] ${users.length} eligible users`);

  for (const u of users) {
    try {
      if (!u.home_lat || !u.home_lon || !u.persona || !u.onesignal_player_id) {
        // defensive — should already be filtered by the query
        continue;
      }
      const hours = await fetchTodayForecast(u.home_lat, u.home_lon);
      const peak = findPeakHour(u.persona, hours);
      if (!peak) {
        stats.skippedNoForecast++;
        continue;
      }
      // Threshold: "Good" or better → 75+ on our 0-100 scale.
      if (peak.peakScore < 75) {
        stats.skippedLowScore++;
        continue;
      }
      const { title, body } = buildMessage(u.persona, peak);
      await sendPush(u.onesignal_player_id, title, body);
      stats.pushesSent++;
      console.log(
        `[daily-surf-report] → ${u.user_id} (${u.persona}): peak=${peak.peakScore} @ ${peak.peakLocalLabel}`,
      );
    } catch (err) {
      stats.errors++;
      console.error(`[daily-surf-report] user ${u.user_id} failed:`, err);
      // keep looping — one bad user must not block the batch
    }
  }

  return stats;
}

// ─── HTTP entrypoint (Deno.serve is Supabase's standard) ───────────────────

Deno.serve(async (req: Request) => {
  // Tolerate any method — pg_cron's net.http_post will send POST; manual
  // curls may use GET. No body required.
  try {
    const stats = await runDailySurfReport();
    return new Response(JSON.stringify({ ok: true, ...stats }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[daily-surf-report] fatal:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
