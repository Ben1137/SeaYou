/**
 * P6.2 Forward Data Assimilation — collects live engine-vs-buoy residuals every 6h.
 *
 * Run: npx tsx packages/core/src/nearshore/dataAssimilation.ts
 *
 * Browserless, no auth. Fetches:
 *   - Current-hour Open-Meteo LIVE forecast (input_source: 'live_forecast')
 *   - Current NDBC/CDIP buoy observation (plain HTTP, no Playwright)
 * Runs nearshoreTransform → upserts one row per buoy-anchored spot.
 * Unique index deduplicates — safe to re-run. JSONL fallback on Supabase failure.
 *
 * Like-for-like: total wave height (Open-Meteo wave_height) vs buoy WVHT (total Hs).
 * compare_basis: 'total_vs_total'
 * deep buoy → engine INPUT H0; nearshore buoy → engine OUTPUT HFinal.
 * Pools: buoy_kind × input_source × compare_basis — NEVER merged.
 */

import { nearshoreTransform } from './transform.js';
import { CALIBRATION_SPOTS, type CalibrationSpot } from './calibration-spots.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

// ---------------------------------------------------------------------------
// Load env (root .env first, then packages/web/.env fallback)
// ---------------------------------------------------------------------------

function loadEnv(): { supabaseUrl: string; supabaseKey: string } {
  let supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  const envPaths = [
    path.join(PROJECT_ROOT, '.env'),
    path.join(PROJECT_ROOT, 'packages/web/.env'),
  ];

  for (const envPath of envPaths) {
    if (!supabaseUrl || !supabaseKey) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const eq = line.indexOf('=');
          if (eq < 1) continue;
          const k = line.slice(0, eq).trim();
          const v = line.slice(eq + 1).trim();
          if (k === 'SUPABASE_URL' && !supabaseUrl) supabaseUrl = v;
          if (k === 'VITE_SUPABASE_URL' && !supabaseUrl) supabaseUrl = v;
          if (k === 'SUPABASE_SERVICE_ROLE_KEY' && !supabaseKey) supabaseKey = v;
        }
      } catch { /* file not found — try next */ }
    }
  }

  return { supabaseUrl, supabaseKey };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssimilationRecord {
  ts:             string;
  spot:           string;
  lat:            number;
  lon:            number;
  swell_dir:      number | null;
  swell_period:   number | null;
  swell_height:   number | null;
  wind_from_deg:  number | null;
  wind_speed:     number | null;
  buoy_kind:      'deep' | 'nearshore';
  input_source:   'live_forecast';
  compare_basis:  'total_vs_total';
  engine_value:   number;
  buoy_value:     number;
  residual:       number;
  source_buoy_id: string;
  engine_version: string;
}

// ---------------------------------------------------------------------------
// Engine version
// ---------------------------------------------------------------------------

function getEngineVersion(): string {
  try {
    const headPath = path.join(PROJECT_ROOT, '.git/HEAD');
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, 'utf8').trim();
      if (head.startsWith('ref: ')) {
        const refPath = path.join(PROJECT_ROOT, '.git', head.slice(5));
        return fs.existsSync(refPath) ? fs.readFileSync(refPath, 'utf8').trim().slice(0, 8) : 'unknown';
      }
      return head.slice(0, 8);
    }
  } catch { /* ignore */ }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Open-Meteo LIVE forecast (current hour) — total wave_height + swell + wind
// input_source: 'live_forecast' — this is the PRODUCTION input, not reanalysis
// ---------------------------------------------------------------------------

interface LiveMarineObs {
  waveHeight:   number;        // total Hs (swell + wind sea) — used for compare_basis: total_vs_total
  wavePeriod:   number | null; // wave_period (total peak period) — canonical T for transform
  swellHeight:  number;        // swell component only (stored as swell_height for features)
  swellPeriod:  number;        // swell-only period — stored as feature column, not used for transform
  swellDir:     number;
  windFromDeg:  number;
  windSpeedMs:  number;
}

async function fetchLiveMarine(lat: number, lon: number): Promise<LiveMarineObs | null> {
  try {
    const marineUrl =
      `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
      `&hourly=wave_height,wave_period,swell_wave_height,swell_wave_period,swell_wave_direction` +
      `&forecast_days=1&timezone=GMT`;
    const windUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=wind_speed_10m,wind_direction_10m&forecast_days=1&timezone=GMT`;

    const [marineRes, windRes] = await Promise.all([
      fetch(marineUrl, { signal: AbortSignal.timeout(10000) }),
      fetch(windUrl,   { signal: AbortSignal.timeout(10000) }),
    ]);
    if (!marineRes.ok || !windRes.ok) return null;

    const marine = await marineRes.json() as {
      hourly: {
        time: string[];
        wave_height: (number | null)[];
        wave_period: (number | null)[];
        swell_wave_height: (number | null)[];
        swell_wave_period: (number | null)[];
        swell_wave_direction: (number | null)[];
      };
    };
    const wind = await windRes.json() as {
      hourly: {
        time: string[];
        wind_speed_10m: (number | null)[];
        wind_direction_10m: (number | null)[];
      };
    };

    // Find current-hour index
    const nowUtc = new Date().toISOString().slice(0, 13);
    let idx = marine.hourly.time.findIndex(t => t.startsWith(nowUtc));
    if (idx < 0) idx = 0;

    const wh  = marine.hourly.wave_height[idx] ?? marine.hourly.wave_height[0];
    const wp  = marine.hourly.wave_period?.[idx] ?? marine.hourly.wave_period?.[0] ?? null; // total peak period — canonical T
    const sh  = marine.hourly.swell_wave_height[idx] ?? marine.hourly.swell_wave_height[0];
    const sp  = marine.hourly.swell_wave_period[idx] ?? marine.hourly.swell_wave_period[0];
    const sd  = marine.hourly.swell_wave_direction[idx] ?? marine.hourly.swell_wave_direction[0];
    const ws  = wind.hourly.wind_speed_10m[idx] ?? wind.hourly.wind_speed_10m[0];
    const wd  = wind.hourly.wind_direction_10m[idx] ?? wind.hourly.wind_direction_10m[0];

    if (wh == null || sp == null) return null;

    return {
      waveHeight:  wh,
      wavePeriod:  wp,
      swellHeight: sh ?? wh,
      swellPeriod: sp,
      swellDir:    sd ?? 0,
      windFromDeg: wd ?? 0,
      windSpeedMs: ws ?? 0,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// NDBC realtime (current obs) — reuses P6.1 pattern
// ---------------------------------------------------------------------------

interface BuoyObs {
  Hs: number | null;
  T:  number | null;
  source: string;
}

async function fetchNDBCRealtime(stationId: string): Promise<BuoyObs> {
  const url = `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { Hs: null, T: null, source: `NDBC-${stationId} HTTP${res.status}` };
    const text = await res.text();

    const lines = text.split('\n').filter(l => l.trim());
    const headerIdx = lines.findIndex(l => l.match(/^#\s*YY/));
    if (headerIdx < 0) return { Hs: null, T: null, source: `NDBC-${stationId} no-header` };

    const header = lines[headerIdx].replace(/^#\s*/, '').trim().split(/\s+/);
    const iWVHT = header.indexOf('WVHT');
    const iDPD  = header.indexOf('DPD');
    if (iWVHT < 0) return { Hs: null, T: null, source: `NDBC-${stationId} no-WVHT` };

    for (let i = headerIdx + 2; i < lines.length; i++) {
      const cols = lines[i].trim().split(/\s+/);
      if (cols.length <= iWVHT) continue;
      const wvhtStr = cols[iWVHT];
      if (wvhtStr === 'MM') continue;
      const Hs = parseFloat(wvhtStr);
      if (isNaN(Hs) || Hs >= 99) continue;
      const T = iDPD >= 0 && cols[iDPD] !== 'MM' ? parseFloat(cols[iDPD]) : null;
      return { Hs, T: T && !isNaN(T) ? T : null, source: `NDBC-${stationId}` };
    }
    return { Hs: null, T: null, source: `NDBC-${stationId} all-MM` };
  } catch {
    return { Hs: null, T: null, source: `NDBC-${stationId} error` };
  }
}

// ---------------------------------------------------------------------------
// CDIP wave_agg (current obs) — queries last 3 hours
// ---------------------------------------------------------------------------

async function fetchCDIPRealtime(stationId: string): Promise<BuoyObs> {
  const paddedId = stationId.padStart(3, '0');
  const url =
    `https://erddap.cdip.ucsd.edu/erddap/tabledap/wave_agg.json` +
    `?time,waveHs,waveTp` +
    `&station_id="${paddedId}"` +
    `&time%3E=now-3hours&orderByMax(%22time%22)`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { Hs: null, T: null, source: `CDIP-${stationId} HTTP${res.status}` };
    const data = await res.json() as { table: { rows: [string, number, number][] } };
    const rows = data?.table?.rows ?? [];
    if (rows.length === 0) return { Hs: null, T: null, source: `CDIP-${stationId} no-rows` };
    const [, Hs, Tp] = rows[0];
    return { Hs: Hs ?? null, T: Tp ?? null, source: `CDIP-${stationId}` };
  } catch {
    return { Hs: null, T: null, source: `CDIP-${stationId} error` };
  }
}

// ---------------------------------------------------------------------------
// Supabase upsert (service_role, RLS bypass)
// ---------------------------------------------------------------------------

async function upsertRecords(
  records: AssimilationRecord[],
  supabaseUrl: string,
  supabaseKey: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/calibration_residuals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(records),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`  Supabase upsert failed: ${res.status} ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`  Supabase upsert error: ${e}`);
    return false;
  }
}

function appendJSONL(records: AssimilationRecord[]) {
  const jsonlPath = path.join(PROJECT_ROOT, 'calibration-forward.jsonl');
  fs.appendFileSync(jsonlPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  console.log(`  JSONL fallback: ${records.length} rows → calibration-forward.jsonl`);
}

// ---------------------------------------------------------------------------
// Process one spot
// ---------------------------------------------------------------------------

async function processSpot(
  spot: CalibrationSpot,
  engineVersion: string,
  { supabaseUrl, supabaseKey }: { supabaseUrl: string; supabaseKey: string },
): Promise<{ written: boolean; skipped: boolean; reason?: string }> {
  if (!spot.buoy) return { written: false, skipped: true, reason: 'no buoy' };

  // Fetch Open-Meteo live forecast
  const marine = await fetchLiveMarine(spot.lat, spot.lon);
  if (!marine) {
    console.log(`  ${spot.name}: Open-Meteo unavailable — skip`);
    return { written: false, skipped: true, reason: 'open-meteo unavailable' };
  }

  // Fetch buoy current obs
  let buoy: BuoyObs;
  if (spot.buoy.network === 'NDBC') {
    buoy = await fetchNDBCRealtime(spot.buoy.id);
  } else if (spot.buoy.network === 'CDIP') {
    buoy = await fetchCDIPRealtime(spot.buoy.id);
  } else {
    console.log(`  ${spot.name}: unsupported network ${spot.buoy.network} — skip`);
    return { written: false, skipped: true, reason: `unsupported network ${spot.buoy.network}` };
  }

  if (buoy.Hs == null) {
    console.log(`  ${spot.name}: buoy unavailable (${buoy.source}) — skip`);
    return { written: false, skipped: true, reason: `buoy unavailable: ${buoy.source}` };
  }

  // Engine: use total wave height + total wave period (total_vs_total basis).
  // Canonical rule: T = wave_period (total peak period), never swell_wave_period.
  const H0 = marine.waveHeight;
  const T  = marine.wavePeriod; // canonical: wave_period (total); null → spot skipped below
  if (T == null) {
    console.log(`  ${spot.name}: wave_period unavailable — skip`);
    return { written: false, skipped: true, reason: 'wave_period unavailable' };
  }
  // Use buoy.depthM for validation comparison (buoy measurement depth), not surf-break depth.
  const transformDepth = spot.buoy ? (spot.buoy.depthM ?? spot.depthM) : spot.depthM;
  const tr = nearshoreTransform(H0, T, transformDepth);

  const engineValue = spot.buoy.kind === 'deep' ? H0 : tr.H;
  const residual    = buoy.Hs - engineValue;

  // Truncate to current-hour timestamp
  const tsHour = new Date();
  tsHour.setMinutes(0, 0, 0);

  const record: AssimilationRecord = {
    ts:             tsHour.toISOString(),
    spot:           spot.name,
    lat:            spot.lat,
    lon:            spot.lon,
    swell_dir:      marine.swellDir,
    swell_period:   marine.swellPeriod,  // swell-only period stored as feature column; transform uses wave_period (T)
    swell_height:   marine.swellHeight,
    wind_from_deg:  marine.windFromDeg,
    wind_speed:     marine.windSpeedMs,
    buoy_kind:      spot.buoy.kind,
    input_source:   'live_forecast',
    compare_basis:  'total_vs_total',
    engine_value:   engineValue,
    buoy_value:     buoy.Hs,
    residual,
    source_buoy_id: `${spot.buoy.network}-${spot.buoy.id}`,
    engine_version: engineVersion,
  };

  const ok = await upsertRecords([record], supabaseUrl, supabaseKey);
  if (!ok) {
    appendJSONL([record]);
  }

  console.log(
    `  ${spot.name.padEnd(18)} buoy=${buoy.Hs.toFixed(2)}m  engine=${engineValue.toFixed(2)}m  Δ=${residual.toFixed(2)}m  ${ok ? '→ Supabase ✓' : '→ JSONL'}`,
  );
  return { written: true, skipped: false };
}

// ---------------------------------------------------------------------------
// Residual report (autonomous — reads calibration_residuals and writes markdown)
// ---------------------------------------------------------------------------

async function writeResidualReport(
  supabaseUrl: string,
  supabaseKey: string,
) {
  try {
    // Query: per spot × buoy_kind × input_source × compare_basis
    const res = await fetch(
      `${supabaseUrl}/rest/v1/calibration_residuals` +
      `?select=spot,buoy_kind,input_source,compare_basis,residual` +
      `&compare_basis=neq.swell_only_legacy` +  // exclude legacy rows from report
      `&order=spot.asc`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!res.ok) {
      console.error(`  Report fetch failed: ${res.status}`);
      return;
    }

    const rows = await res.json() as Array<{
      spot: string;
      buoy_kind: string;
      input_source: string;
      compare_basis: string;
      residual: number;
    }>;

    if (rows.length === 0) {
      console.log('  No clean rows yet for residual report.');
      return;
    }

    // Aggregate by group key
    type GroupKey = string;
    const groups = new Map<GroupKey, number[]>();
    for (const row of rows) {
      const key = `${row.spot}|${row.buoy_kind}|${row.input_source}|${row.compare_basis}`;
      const arr = groups.get(key) ?? [];
      arr.push(row.residual);
      groups.set(key, arr);
    }

    const mean   = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const median = (a: number[]) => {
      const s = [...a].sort((x, y) => x - y);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const std = (a: number[]) => {
      const m = mean(a);
      return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
    };

    const reportLines = [
      `# Calibration Residual Report`,
      ``,
      `**Generated:** ${new Date().toISOString()}  `,
      `**Clean rows (exclude swell_only_legacy):** ${rows.length}  `,
      ``,
      `## Per-Group Summary`,
      `| Spot | Kind | Source | Basis | n | Mean Δ | Median Δ | StdDev | Learnable? |`,
      `|------|------|--------|-------|---|--------|----------|--------|-----------|`,
    ];

    for (const [key, residuals] of groups.entries()) {
      const [spot, kind, source, basis] = key.split('|');
      const m   = mean(residuals);
      const med = median(residuals);
      const s   = std(residuals);
      const n   = residuals.length;
      // Heuristic: learnable if |bias| > 0.1m AND spread < 3× |bias|
      const learnable = Math.abs(m) > 0.1 && s < 3 * Math.abs(m) ? '✓ consistent bias' : '? noisy';
      reportLines.push(
        `| ${spot} | ${kind} | ${source} | ${basis} | ${n} | ${m.toFixed(3)}m | ${med.toFixed(3)}m | ${s.toFixed(3)}m | ${learnable} |`,
      );
    }

    reportLines.push('');
    reportLines.push('## P6.3 Gate');
    reportLines.push('');
    reportLines.push('Run `npx tsx packages/core/src/nearshore/backfillResiduals.ts` (full 2020–2023) before P6.3.');
    reportLines.push('');
    reportLines.push('_Auto-generated by P6.2 dataAssimilation.ts — no browser, no login._');

    const reportPath = path.join(PROJECT_ROOT, 'calibration-residual-report.md');
    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
    console.log(`  Residual report written → calibration-residual-report.md`);
  } catch (e) {
    console.error(`  Report generation failed: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== P6.2 Data Assimilation — Forward Collector ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const { supabaseUrl, supabaseKey } = loadEnv();
  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in environment.');
    console.error('Add them to repo-root .env or set as environment variables (GitHub Actions secrets).');
    // Exit 0 so cron never red-X's on a config issue
    process.exit(0);
  }
  console.log(`Supabase: ${supabaseUrl.slice(0, 40)}... key: ${supabaseKey ? 'present' : 'MISSING'}`);

  const engineVersion = getEngineVersion();
  console.log(`Engine version: ${engineVersion}\n`);

  const spots = CALIBRATION_SPOTS.filter(s => s.buoy);
  let written = 0, skipped = 0;

  for (const spot of spots) {
    const result = await processSpot(spot, engineVersion, { supabaseUrl, supabaseKey });
    if (result.written) written++;
    else skipped++;
  }

  console.log(`\nSummary: ${written} written, ${skipped} skipped`);

  // Write residual report
  console.log('\nGenerating residual report...');
  await writeResidualReport(supabaseUrl, supabaseKey);

  console.log('\n=== Done ===\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(0); // exit 0 so GitHub Actions cron doesn't alarm on external API failure
});
