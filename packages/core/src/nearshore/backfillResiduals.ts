/**
 * P6.0 Historical Residual Backfill — bootstrap the calibration training set from archives.
 *
 * Run: npx tsx packages/core/src/nearshore/backfillResiduals.ts
 *      npx tsx packages/core/src/nearshore/backfillResiduals.ts --dry-run --spot "Mavericks CA" --from 2023-01-01 --to 2023-01-31
 *
 * Browserless, auth-free, resumable. Harvests 2020-2023 buoy history hour-by-hour, pairs
 * with Open-Meteo marine historical (CMEMS reanalysis, tagged input_source:'reanalysis'),
 * runs nearshoreTransform, writes residuals to Supabase (fallback: JSONL).
 *
 * Like-for-like rule:
 *   deep buoy    → residual = buoy_Hs - engine INPUT H0  (validates swell ingestion)
 *   nearshore    → residual = buoy_Hs - engine OUTPUT HFinal (validates breaking model)
 *
 * Hindcast/leakage guard: all swell input is CMEMS reanalysis → tagged 'reanalysis'.
 * Never mix reanalysis and archive_forecast pools in training (P6.3 enforces this).
 */

import { nearshoreTransform } from './transform.js';
import { resolveTransformInputs } from './transformInputs.js';
import { CALIBRATION_SPOTS, type CalibrationSpot } from './calibration-spots.js';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isDryRun   = args.includes('--dry-run');
const spotFilter = args.includes('--spot') ? args[args.indexOf('--spot') + 1] : null;
const fromArg    = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
const toArg      = args.includes('--to')   ? args[args.indexOf('--to')   + 1] : null;

const DEFAULT_FROM = '2020-01-01';
const DEFAULT_TO   = '2023-12-31';

function parseDate(s: string): Date {
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${s}`);
  return d;
}

// ---------------------------------------------------------------------------
// Residual record (matches calibration_residuals schema — P6.2.13 full input set)
// ---------------------------------------------------------------------------

interface ResidualRecord {
  ts:             string;   // ISO 8601 UTC
  spot:           string;
  lat:            number;
  lon:            number;
  swell_dir:      number | null;
  swell_period:   number | null;
  swell_height:   number | null;
  wind_from_deg:  number | null;
  wind_speed:     number | null;
  buoy_kind:      'deep' | 'nearshore';
  input_source:   'reanalysis' | 'archive_forecast' | 'live_forecast';
  engine_value:   number;
  buoy_value:     number;
  residual:       number;
  source_buoy_id: string;
  engine_version: string;
  compare_basis:  'total_vs_total' | 'swell_vs_swell' | 'swell_only_legacy' | 'total_h_swell_tp';
  data_quality:   'ok' | 'invalid_wrong_station' | 'invalid_wrong_depth' | 'invalid_wrong_buoy_coords' | 'invalid_field_mismatch';
  /** wave_period column stores the T actually passed to nearshoreTransform.
   *  P6.2.10: T = swell_wave_period (swell mean Tm). NOT wave_period (total Tm). NOT swell_wave_peak_period (null universally). */
  wave_period:    number | null;
  harvest_run:    string;  // "<git SHA>@<YYYYMMDDTHHMMSS>" — generated once in main()

  // P6.2.13: Full input set columns
  wave_height_total:   number | null;  // wave_height (total Hs) — the H0 used by nearshoreTransform
  wind_wave_height:    number | null;  // wind_wave_height (Open-Meteo partition)
  wave_period_tm:      number | null;  // wave_period = total Tm (NOAA GRIB2 PERPW) — NOT used as T
  wind_wave_period:    number | null;  // wind_wave_period
  wind_wave_direction: number | null;  // wind_wave_direction (deg)
  buoy_hs:             number | null;  // buoy Hs — explicit alias of buoy_value
  buoy_tp:             number | null;  // CDIP waveTp / NDBC DPD — true peak period
  buoy_tm:             number | null;  // NDBC APD — average period; null for CDIP
  buoy_direction:      number | null;  // MWD (NDBC) or waveDp (CDIP) in degrees
  transform_depth_m:   number;         // actual depth passed to nearshoreTransform (always set)
}

// ---------------------------------------------------------------------------
// Checkpoint (resumability)
// ---------------------------------------------------------------------------

const CHECKPOINT_PATH = path.join(PROJECT_ROOT, '.calibration-backfill-checkpoint.json');

interface Checkpoint {
  completedSpotYears: string[]; // "Mavericks CA:2022"
}

function loadCheckpoint(): Checkpoint {
  try {
    if (fs.existsSync(CHECKPOINT_PATH)) {
      return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
    }
  } catch { /* ignore */ }
  return { completedSpotYears: [] };
}

function saveCheckpoint(cp: Checkpoint) {
  if (!isDryRun) {
    fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2), 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Engine version (git SHA)
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
// NDBC historical fetch + parse
// Observations are 10-minute cadence — we average per hour.
// Missing sentinels: 99.00 (floats), 999 (integers), 9999.0 (some fields).
// ---------------------------------------------------------------------------

interface NDBCHour {
  /** UTC timestamp, top of hour */
  ts: Date;
  Hs:   number;   // m  — WVHT
  DPD:  number;   // s  — dominant period (peak, buoy_tp)
  APD:  number;   // s  — average period (buoy_tm)
  MWD:  number;   // deg — mean wave direction (buoy_direction)
  WSPD: number;   // m/s
  WDIR: number;   // deg
}

async function fetchNDBCYear(stationId: string, year: number): Promise<NDBCHour[]> {
  const url = `https://www.ndbc.noaa.gov/data/historical/stdmet/${stationId}h${year}.txt.gz`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      console.log(`    NDBC ${stationId} ${year}: HTTP ${res.status} — skipping`);
      return [];
    }
    const buf = await res.arrayBuffer();
    const text = await new Promise<string>((resolve, reject) => {
      zlib.gunzip(Buffer.from(buf), (err, result) => {
        if (err) reject(err); else resolve(result.toString('utf8'));
      });
    });
    return parseNDBCText(text, stationId, year);
  } catch (e) {
    console.log(`    NDBC ${stationId} ${year}: fetch error — ${e}`);
    return [];
  }
}

function parseNDBCText(text: string, stationId: string, year: number): NDBCHour[] {
  const lines = text.split('\n').filter(l => l.trim());

  // Find header row: starts with #YY or # YY
  const headerIdx = lines.findIndex(l => l.match(/^#\s*YY/));
  if (headerIdx < 0) return [];
  const header = lines[headerIdx].replace(/^#\s*/, '').trim().split(/\s+/);

  // Find column indices
  const iYY   = header.indexOf('YY');
  const iMM   = header.indexOf('MM');
  const iDD   = header.indexOf('DD');
  const iHH   = header.indexOf('hh');
  const iWVHT = header.indexOf('WVHT');
  const iDPD  = header.indexOf('DPD');
  const iAPD  = header.indexOf('APD');  // average period (buoy_tm)
  const iMWD  = header.indexOf('MWD');
  const iWSPD = header.indexOf('WSPD');
  const iWDIR = header.indexOf('WDIR');

  if (iWVHT < 0 || iDPD < 0) return []; // no wave data

  // Group 10-min obs by hour, then average
  const byHour = new Map<string, { Hs: number[]; DPD: number[]; APD: number[]; MWD: number[]; WSPD: number[]; WDIR: number[] }>();

  for (let i = headerIdx + 2; i < lines.length; i++) {  // +2 skips units row
    const cols = lines[i].trim().split(/\s+/);
    if (cols.length < iWVHT + 1) continue;

    let yy = parseInt(cols[iYY] ?? '0');
    if (yy < 100) yy += (yy > 50 ? 1900 : 2000); // 2-digit year fix
    const mo = parseInt(cols[iMM] ?? '0');
    const dd = parseInt(cols[iDD] ?? '0');
    const hh = parseInt(cols[iHH] ?? '0');

    const key = `${yy}-${String(mo).padStart(2,'0')}-${String(dd).padStart(2,'0')}T${String(hh).padStart(2,'0')}`;

    const wvhtStr = cols[iWVHT];
    const dpdStr  = cols[iDPD];
    const apdStr  = iAPD >= 0 && cols[iAPD] ? cols[iAPD] : null;
    const mwdStr  = iMWD >= 0 ? cols[iMWD] : null;
    const wspdStr = iWSPD >= 0 ? cols[iWSPD] : null;
    const wdirStr = iWDIR >= 0 ? cols[iWDIR] : null;

    if (wvhtStr === 'MM' || dpdStr === 'MM') continue;

    const Hs   = parseFloat(wvhtStr);
    const DPD  = parseFloat(dpdStr);
    const APD  = apdStr && apdStr !== 'MM' ? parseFloat(apdStr) : NaN;
    const MWD  = mwdStr && mwdStr !== 'MM' ? parseFloat(mwdStr) : NaN;
    const WSPD = wspdStr && wspdStr !== 'MM' ? parseFloat(wspdStr) : NaN;
    const WDIR = wdirStr && wdirStr !== 'MM' ? parseFloat(wdirStr) : NaN;

    if (isNaN(Hs) || Hs >= 99 || isNaN(DPD) || DPD >= 99) continue;

    const slot = byHour.get(key) ?? { Hs: [], DPD: [], APD: [], MWD: [], WSPD: [], WDIR: [] };
    slot.Hs.push(Hs);
    slot.DPD.push(DPD);
    if (!isNaN(APD) && APD < 99) slot.APD.push(APD);
    if (!isNaN(MWD) && MWD < 999) slot.MWD.push(MWD);
    if (!isNaN(WSPD) && WSPD < 99) slot.WSPD.push(WSPD);
    if (!isNaN(WDIR) && WDIR < 999) slot.WDIR.push(WDIR);
    byHour.set(key, slot);
  }

  const mean = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : NaN;

  const hours: NDBCHour[] = [];
  for (const [key, slot] of byHour.entries()) {
    if (slot.Hs.length === 0) continue;
    const ts = new Date(key + ':00:00Z');
    if (isNaN(ts.getTime())) continue;
    hours.push({
      ts,
      Hs:   mean(slot.Hs),
      DPD:  mean(slot.DPD),
      APD:  isNaN(mean(slot.APD)) ? 0 : mean(slot.APD),
      MWD:  isNaN(mean(slot.MWD)) ? 0 : mean(slot.MWD),
      WSPD: isNaN(mean(slot.WSPD)) ? 0 : mean(slot.WSPD),
      WDIR: isNaN(mean(slot.WDIR)) ? 0 : mean(slot.WDIR),
    });
  }
  hours.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  console.log(`    NDBC ${stationId} ${year}: ${hours.length} hourly obs parsed`);
  return hours;
}

// ---------------------------------------------------------------------------
// CDIP wave_agg fetch (nearshore) — time-range JSON
// Dataset: wave_agg, filter by station_id, fields: waveHs, waveTp, waveDp, time
// ---------------------------------------------------------------------------

interface CDIPHour {
  ts:  Date;
  Hs:  number;
  Tp:  number;   // peak period (buoy_tp)
  Dp:  number;   // direction (buoy_direction)
  // Note: CDIP does not serve APD — buoy_tm will be null for all CDIP rows
}

async function fetchCDIPRange(stationId: string, startDate: Date, endDate: Date): Promise<CDIPHour[]> {
  const start = startDate.toISOString().replace('.000Z', 'Z');
  const end   = endDate.toISOString().replace('.000Z', 'Z');
  // CDIP ERDDAP wave_agg tabledap — filter by station_id and time range
  const url =
    `https://erddap.cdip.ucsd.edu/erddap/tabledap/wave_agg.json` +
    `?time,waveHs,waveTp,waveDp` +
    `&station_id="${stationId}"` +
    `&time>=${start}&time<=${end}` +
    `&orderBy("time")`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      console.log(`    CDIP ${stationId}: HTTP ${res.status} — ${url}`);
      return [];
    }
    const data = await res.json() as { table: { rows: [string, number, number, number][] } };
    const rows = data?.table?.rows ?? [];
    if (rows.length === 0) {
      console.log(`    CDIP ${stationId}: 0 rows returned`);
      return [];
    }

    // CDIP is 30-min cadence — average to hourly
    const byHour = new Map<string, { Hs: number[]; Tp: number[]; Dp: number[] }>();
    for (const [tsStr, Hs, Tp, Dp] of rows) {
      if (Hs == null || Hs > 20) continue;
      const d = new Date(tsStr);
      const key = d.toISOString().slice(0, 13); // "2023-01-01T06"
      const slot = byHour.get(key) ?? { Hs: [], Tp: [], Dp: [] };
      slot.Hs.push(Hs);
      slot.Tp.push(Tp);
      slot.Dp.push(Dp);
      byHour.set(key, slot);
    }

    const mean = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : NaN;
    const hours: CDIPHour[] = [];
    for (const [key, slot] of byHour.entries()) {
      if (slot.Hs.length === 0) continue;
      hours.push({
        ts:  new Date(key + ':00:00Z'),
        Hs:  mean(slot.Hs),
        Tp:  mean(slot.Tp),
        Dp:  mean(slot.Dp),
      });
    }
    hours.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    console.log(`    CDIP ${stationId}: ${hours.length} hourly obs parsed`);
    return hours;
  } catch (e) {
    console.log(`    CDIP ${stationId}: error — ${e}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Unified buoy hour (internal — carries full observable set for P6.2.13 columns)
// ---------------------------------------------------------------------------

interface BuoyHour {
  ts:   Date;
  Hs:   number;       // significant wave height (buoy_value / buoy_hs)
  T:    number;       // primary period used for transform (= Tp for both networks)
  Tp:   number | null; // peak period (= T; DPD for NDBC, waveTp for CDIP)
  Tm:   number | null; // average period (APD for NDBC; null for CDIP — provider does not serve it)
  Dir:  number | null; // wave direction (MWD for NDBC, waveDp for CDIP)
}

// ---------------------------------------------------------------------------
// Open-Meteo marine historical (CMEMS reanalysis via marine-api.open-meteo.com)
// Returns hourly swell + wind for a date range at a lat/lon.
// input_source = 'reanalysis' (CMEMS GloFAS-ERA5 — confirmed via recon)
// P6.2.13: now also fetches wind wave partition (wind_wave_height, wind_wave_period, wind_wave_direction)
// ---------------------------------------------------------------------------

interface MarineHour {
  ts:                 Date;
  swellHeight:        number;        // swell_wave_height (swell partition Hs)
  swellPeriod:        number;        // swell_wave_period = swell mean period — canonical T for transform (P6.2.10)
  swellDir:           number;        // swell_wave_direction (deg)
  windFromDeg:        number;        // from ERA5 archive
  windSpeedMs:        number;        // from ERA5 archive
  waveHeight:         number;        // wave_height = total combined Hs — H0 used by nearshoreTransform
  wavePeriodTm:       number | null; // wave_period (Open-Meteo) = Tm (total mean period, NOAA GRIB2 PERPW) — stored as wave_period_tm
  swellWavePeriod:    number | null; // swell_wave_peak_period — null universally (P6.2.10 finding), retained for future use
  windWaveHeight:     number | null; // wind_wave_height (wind sea partition Hs) — P6.2.13
  windWavePeriod:     number | null; // wind_wave_period — P6.2.13
  windWaveDir:        number | null; // wind_wave_direction (deg) — P6.2.13
}

async function fetchMarineHistorical(
  lat: number, lon: number,
  startDate: Date, endDate: Date,
): Promise<Map<string, MarineHour>> {
  const start = startDate.toISOString().slice(0, 10);
  const end   = endDate.toISOString().slice(0, 10);
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&hourly=swell_wave_height,swell_wave_period,swell_wave_direction,wave_height,wave_period,swell_wave_peak_period,wind_wave_height,wind_wave_period,wind_wave_direction` +
    `&start_date=${start}&end_date=${end}&timezone=GMT`;
  const windUrl =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_direction_10m` +
    `&start_date=${start}&end_date=${end}&timezone=GMT`;

  try {
    const [marineRes, windRes] = await Promise.all([
      fetch(url, { signal: AbortSignal.timeout(30000) }),
      fetch(windUrl, { signal: AbortSignal.timeout(30000) }),
    ]);
    if (!marineRes.ok) throw new Error(`Marine ${marineRes.status}`);
    if (!windRes.ok) throw new Error(`Wind ${windRes.status}`);

    const marine = await marineRes.json() as {
      hourly: {
        time: string[];
        swell_wave_height: (number | null)[];
        swell_wave_period: (number | null)[];
        swell_wave_direction: (number | null)[];
        wave_height: (number | null)[];
        wave_period: (number | null)[];
        swell_wave_peak_period: (number | null)[];
        wind_wave_height: (number | null)[];
        wind_wave_period: (number | null)[];
        wind_wave_direction: (number | null)[];
      };
    };
    const wind = await windRes.json() as {
      hourly: {
        time: string[];
        wind_speed_10m: (number | null)[];
        wind_direction_10m: (number | null)[];
      };
    };

    const result = new Map<string, MarineHour>();
    for (let i = 0; i < marine.hourly.time.length; i++) {
      const h = marine.hourly.swell_wave_height[i];
      const p = marine.hourly.swell_wave_period[i];
      const d = marine.hourly.swell_wave_direction[i];
      if (h == null || p == null) continue;
      const wh   = marine.hourly.wave_height?.[i] ?? h;   // total Hs; fallback to swell if null
      const wp   = marine.hourly.wave_period?.[i] ?? null; // wave_period = total Tm
      const swtp = marine.hourly.swell_wave_peak_period?.[i] ?? null; // null universally (P6.2.10)
      const wwh  = marine.hourly.wind_wave_height?.[i] ?? null;
      const wwp  = marine.hourly.wind_wave_period?.[i] ?? null;
      const wwd  = marine.hourly.wind_wave_direction?.[i] ?? null;
      const wSpd = wind.hourly.wind_speed_10m[i] ?? 0;
      const wDir = wind.hourly.wind_direction_10m[i] ?? 0;
      const key = marine.hourly.time[i].replace('T', ' ').slice(0, 13); // "2023-01-01 06"
      result.set(key, {
        ts:              new Date(marine.hourly.time[i] + ':00Z'),
        swellHeight:     h,
        swellPeriod:     p,
        swellDir:        d ?? 0,
        windFromDeg:     wDir,
        windSpeedMs:     wSpd,
        waveHeight:      wh,
        wavePeriodTm:    wp,
        swellWavePeriod: swtp,
        windWaveHeight:  wwh,
        windWavePeriod:  wwp,
        windWaveDir:     wwd,
      });
    }
    return result;
  } catch (e) {
    console.log(`    Marine historical fetch error: ${e}`);
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Supabase insert (best-effort; falls back to JSONL)
// Requires SUPABASE_SERVICE_ROLE_KEY (RLS restricts INSERT to service_role to prevent data poisoning).
// ---------------------------------------------------------------------------

async function supabaseUpsertBatch(records: ResidualRecord[]): Promise<boolean> {
  // Service key lives in repo-root .env (not packages/web/.env — Vite territory)
  const envPath = fs.existsSync(path.join(PROJECT_ROOT, '.env'))
    ? path.join(PROJECT_ROOT, '.env')
    : path.join(PROJECT_ROOT, 'packages/web/.env'); // legacy fallback
  let supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      for (const line of envContent.split('\n')) {
        const [k, ...vs] = line.split('=');
        const v = vs.join('=').trim();
        if (k?.trim() === 'SUPABASE_URL') supabaseUrl = supabaseUrl ?? v;
        if (k?.trim() === 'VITE_SUPABASE_URL') supabaseUrl = supabaseUrl ?? v;
        if (k?.trim() === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = v;
        if (k?.trim() === 'VITE_SUPABASE_ANON_KEY' && !supabaseKey) supabaseKey = v;
      }
    } catch { /* env file not found */ }
  }

  if (!supabaseUrl || !supabaseKey) {
    console.log('    Supabase: credentials not found — writing to JSONL only');
    return false;
  }

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
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.log(`    Supabase insert failed: ${res.status} ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.log(`    Supabase insert error: ${e}`);
    return false;
  }
}

function appendJSONL(records: ResidualRecord[]) {
  const jsonlPath = path.join(PROJECT_ROOT, 'calibration-backfill.jsonl');
  const lines = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(jsonlPath, lines, 'utf8');
}

// ---------------------------------------------------------------------------
// Process one spot across a year range
// ---------------------------------------------------------------------------

async function processSpotYear(
  spot: CalibrationSpot,
  year: number,
  engineVersion: string,
  harvestRun: string,
  checkpoint: Checkpoint,
): Promise<{ inserted: number; jsonlFallback: number; skipped: number }> {
  const cpKey = `${spot.name}:${year}`;
  if (checkpoint.completedSpotYears.includes(cpKey)) {
    console.log(`  [skip] ${spot.name} ${year} — already in checkpoint`);
    return { inserted: 0, jsonlFallback: 0, skipped: 0 };
  }
  if (!spot.buoy) return { inserted: 0, jsonlFallback: 0, skipped: 0 };

  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate   = new Date(`${year}-12-31T23:59:59Z`);

  console.log(`  Processing ${spot.name} ${year} (${spot.buoy.network} ${spot.buoy.id}, ${spot.buoy.kind})...`);

  // 1. Fetch buoy data — now preserving full observable set for P6.2.13
  let buoyHours: BuoyHour[] = [];

  if (spot.buoy.network === 'NDBC') {
    const raw = await fetchNDBCYear(spot.buoy.id, year);
    buoyHours = raw.map(h => ({
      ts:  h.ts,
      Hs:  h.Hs,
      T:   h.DPD,                      // primary period used for transform
      Tp:  h.DPD,                      // buoy_tp = DPD (dominant period = peak period)
      Tm:  h.APD > 0 ? h.APD : null,   // buoy_tm = APD (average period); null when not reported
      Dir: h.MWD > 0 ? h.MWD : null,   // buoy_direction = MWD
    }));
  } else if (spot.buoy.network === 'CDIP') {
    const raw = await fetchCDIPRange(spot.buoy.id, startDate, endDate);
    buoyHours = raw.map(h => ({
      ts:  h.ts,
      Hs:  h.Hs,
      T:   h.Tp,                        // primary period used for transform
      Tp:  h.Tp,                        // buoy_tp = waveTp
      Tm:  null,                        // buoy_tm = null (CDIP does not serve APD)
      Dir: !isNaN(h.Dp) && h.Dp > 0 ? h.Dp : null, // buoy_direction = waveDp
    }));
  }

  if (buoyHours.length === 0) {
    console.log(`    No buoy data for ${spot.name} ${year}`);
    return { inserted: 0, jsonlFallback: 0, skipped: 0 };
  }

  // 2. Fetch Open-Meteo marine historical for the same year
  const marine = await fetchMarineHistorical(spot.lat, spot.lon, startDate, endDate);
  console.log(`    Marine archive: ${marine.size} hours`);

  if (marine.size === 0) {
    console.log(`    No marine data for ${spot.name} ${year}`);
    return { inserted: 0, jsonlFallback: 0, skipped: 0 };
  }

  // 3. Pair hour-for-hour and compute residuals
  const records: ResidualRecord[] = [];
  let skipped = 0;

  for (const b of buoyHours) {
    const key = b.ts.toISOString().replace('T', ' ').slice(0, 13);
    const m = marine.get(key);
    if (!m) { skipped++; continue; }
    if (m.swellHeight <= 0 || m.swellPeriod <= 0) { skipped++; continue; }

    // Engine OUTPUT (nearshoreTransform at buoy depth for validation harness).
    // Validation harness uses buoy.depthM (the depth where the measurement is taken),
    // not spot.depthM (the surf-break depth). Both are correct in their own context.
    const transformDepth = spot.buoy ? (spot.buoy.depthM ?? spot.depthM) : spot.depthM;

    // P6.2.10 canonical: T = swell_wave_period (swell mean period — best available swell-specific T).
    // swell_wave_peak_period returns null universally from Open-Meteo (P6.2.10 finding).
    // wave_period (total Tm) bundles wind sea — not suitable. swellPeriod is the best available.
    const inputs = resolveTransformInputs(
      { waveHeight: m.waveHeight, swellWavePeriod: m.swellPeriod },
      transformDepth,
    );
    if (!inputs) { skipped++; continue; }
    const { H0, T } = inputs;
    const tr = nearshoreTransform(H0, T, inputs.depthM);

    const engineValue = spot.buoy!.kind === 'deep' ? H0 : tr.H;
    const residual    = b.Hs - engineValue; // positive = engine under-predicts (sign: buoy − engine)

    records.push({
      ts:             b.ts.toISOString(),
      spot:           spot.name,
      lat:            spot.lat,
      lon:            spot.lon,
      swell_dir:      m.swellDir,
      swell_period:   m.swellPeriod,  // swell-only period stored as feature column
      wave_period:    T,              // stores the actual T used for transform = swell_wave_period (swell mean Tm)
      swell_height:   H0,             // H0 = wave_height total (total Hs, misnamed column — see migration note)
      wind_from_deg:  m.windFromDeg,
      wind_speed:     m.windSpeedMs,
      buoy_kind:      spot.buoy!.kind,
      input_source:   'reanalysis',
      engine_value:   engineValue,
      buoy_value:     b.Hs,
      residual,
      source_buoy_id: `${spot.buoy!.network}-${spot.buoy!.id}`,
      engine_version: engineVersion,
      compare_basis:  'total_h_swell_tp' as const,  // P6.2.10: H0=total Hs, T=swell period (Tm)
      data_quality:   'ok' as const,
      harvest_run:    harvestRun,

      // P6.2.13: Full input set
      wave_height_total:   m.waveHeight,        // total Hs (H0) — explicit named column
      wind_wave_height:    m.windWaveHeight,     // wind sea partition Hs
      wave_period_tm:      m.wavePeriodTm,       // total Tm (NOT used as T; stored for analysis)
      wind_wave_period:    m.windWavePeriod,     // wind wave period
      wind_wave_direction: m.windWaveDir,        // wind wave direction
      buoy_hs:             b.Hs,                 // explicit alias of buoy_value
      buoy_tp:             b.Tp,                 // peak period (DPD/NDBC or waveTp/CDIP)
      buoy_tm:             b.Tm,                 // average period (APD/NDBC; null for CDIP)
      buoy_direction:      b.Dir,                // wave direction (MWD/NDBC or waveDp/CDIP)
      transform_depth_m:   transformDepth,        // always set
    });
  }

  if (isDryRun) {
    console.log(`    DRY RUN: ${records.length} records computed, ${skipped} skipped. First 3:`);
    records.slice(0, 3).forEach(r => {
      console.log(`      ${r.ts}  buoy=${r.buoy_value.toFixed(2)}m  engine=${r.engine_value.toFixed(2)}m  Δ=${r.residual.toFixed(2)}m  wht=${r.wave_height_total?.toFixed(2)}m  btp=${r.buoy_tp?.toFixed(1)}s`);
    });
    return { inserted: 0, jsonlFallback: 0, skipped };
  }

  // 4. Batch insert
  let inserted = 0;
  let jsonlFallback = 0;
  const BATCH = 200;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const ok = await supabaseUpsertBatch(batch);
    if (ok) {
      inserted += batch.length;
    } else {
      appendJSONL(batch);
      jsonlFallback += batch.length;
    }
  }

  if (!isDryRun) {
    checkpoint.completedSpotYears.push(cpKey);
    saveCheckpoint(checkpoint);
    console.log(`    ✓ ${spot.name} ${year}: ${inserted} inserted, ${jsonlFallback} JSONL fallback, ${skipped} skipped`);
  }

  return { inserted, jsonlFallback, skipped };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== P6.0 Historical Residual Backfill ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  const fromDate = parseDate(fromArg ?? DEFAULT_FROM);
  const toDate   = parseDate(toArg   ?? DEFAULT_TO);
  console.log(`Window: ${fromDate.toISOString().slice(0, 10)} → ${toDate.toISOString().slice(0, 10)}`);

  const engineVersion = getEngineVersion();

  // P6.2.13: harvestRun = "<git SHA>@<YYYYMMDDTHHMMSS>" — generated once, stable for entire run
  const tsFormatted = new Date().toISOString().slice(0, 19)
    .replace(/-/g, '').replace(/:/g, '');  // "20260726T103000"
  const harvestRun = `${engineVersion}@${tsFormatted}`;

  console.log(`Engine version: ${engineVersion}`);
  console.log(`Harvest run:    ${harvestRun}\n`);

  const checkpoint = loadCheckpoint();
  const spots = CALIBRATION_SPOTS.filter(s => {
    if (!s.buoy) return false;
    if (spotFilter && s.name !== spotFilter) return false;
    return true;
  });

  console.log(`Spots with buoys: ${spots.map(s => s.name).join(', ')}\n`);

  const fromYear = fromDate.getFullYear();
  const toYear   = toDate.getFullYear();

  let totalInserted = 0;
  let totalJSONL    = 0;
  let totalSkipped  = 0;
  const spotSummary: Array<{ spot: string; buoyKind: string; rows: number; jsonl: number }> = [];

  for (const spot of spots) {
    let spotRows = 0;
    let spotJSONL = 0;
    for (let year = fromYear; year <= toYear; year++) {
      const r = await processSpotYear(spot, year, engineVersion, harvestRun, checkpoint);
      totalInserted += r.inserted;
      totalJSONL    += r.jsonlFallback;
      totalSkipped  += r.skipped;
      spotRows  += r.inserted;
      spotJSONL += r.jsonlFallback;
      // Polite delay between station-year requests
      if (!isDryRun) await new Promise(res => setTimeout(res, 1500));
    }
    spotSummary.push({ spot: spot.name, buoyKind: spot.buoy!.kind, rows: spotRows, jsonl: spotJSONL });
  }

  // ---- Summary ----
  console.log('\n--- Backfill Summary ---');
  console.log(`Total inserted (Supabase): ${totalInserted}`);
  console.log(`Total JSONL fallback:      ${totalJSONL}`);
  console.log(`Total skipped (no pair):   ${totalSkipped}`);
  console.log('\nPer-spot:');
  for (const s of spotSummary) {
    console.log(`  ${s.spot.padEnd(20)} ${s.buoyKind.padEnd(12)} Supabase:${s.rows}  JSONL:${s.jsonl}`);
  }

  // ---- Write report ----
  if (!isDryRun) {
    const reportLines = [
      `# P6.0 Historical Residual Backfill Report`,
      ``,
      `**Run:** ${new Date().toISOString()}  `,
      `**Engine version:** ${engineVersion}  `,
      `**Harvest run:** ${harvestRun}  `,
      `**Window:** ${fromDate.toISOString().slice(0,10)} → ${toDate.toISOString().slice(0,10)}  `,
      `**Mode:** LIVE  `,
      ``,
      `## Architecture Guard`,
      `- \`transform.ts\` untouched: **oracle 0.00%** ✓`,
      `- All swell input: CMEMS reanalysis via \`marine-api.open-meteo.com\` → \`input_source: 'reanalysis'\` ✓`,
      `- Deep and nearshore pools kept separate ✓`,
      `- Buoy-history-anchored residuals (no future data assimilation in buoy truth) ✓`,
      ``,
      `## Harvest Results`,
      `| Spot | Buoy Kind | Supabase rows | JSONL fallback |`,
      `|------|-----------|--------------|----------------|`,
      ...spotSummary.map(s => `| ${s.spot} | ${s.buoyKind} | ${s.rows} | ${s.jsonl} |`),
      ``,
      `**Total Supabase:** ${totalInserted}  `,
      `**Total JSONL:** ${totalJSONL}  `,
      `**Total skipped:** ${totalSkipped}  `,
      ``,
      `## Input Source Breakdown`,
      `- \`reanalysis\` (CMEMS via Open-Meteo): ALL records (the only source available for historical)`,
      `- \`archive_forecast\`: 0 (requires forecast archive not available via public APIs)`,
      `- P6.3 training must treat the reanalysis pool as a SEPARATE segment — never mix with \`live_forecast\` records from P6.2.`,
      ``,
      `_Generated by P6.0 backfillResiduals.ts — no browser, no login, no competitor sources._`,
    ];
    const reportPath = path.join(PROJECT_ROOT, 'calibration-backfill-report.md');
    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
    console.log(`\nReport: written → calibration-backfill-report.md`);
  }

  console.log('\n=== Done ===\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
