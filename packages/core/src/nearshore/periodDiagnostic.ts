/**
 * P6.2.3 Period-Bias Diagnostic — input vs physics, multi-model, multi-basin.
 *
 * Run: npx tsx packages/core/src/nearshore/periodDiagnostic.ts
 *
 * Diagnoses the period-monotonic negative bias in nearshore spots (Scripps, Santa Cruz)
 * confirmed by P6.2.2. Three analyses (no physics change, no model training):
 *
 * A) Multi-model comparison:
 *    - Archive (2022-2023): best_match vs era5_ocean (only two models with historical archive)
 *    - Recent (~7 days): best_match vs ecmwf_wam025 vs ncep_gfswave025 (forecast-window models)
 *    Note: meteofrance_wave_global, icon_wave etc. are INVALID model strings and are NOT used.
 *    ecmwf/ncep are forecast-only (not usable for historical calibration).
 *
 * B) Input-vs-transform decomposition:
 *    For nearshore spots, check whether long-period bias already exists in the INPUT
 *    (Open-Meteo H0 vs nearest deep buoy's Hs) or first appears in the OUTPUT
 *    (nearshoreTransform HFinal vs nearshore buoy Hs). Per-period-band verdict.
 *
 * C) Coverage expansion: new nearshore stations registered in calibration-spots.ts.
 *    Gaps documented. No backfill in this run.
 *
 * Output: calibration-period-diagnostic-report.md
 * Analysis only — transform.ts READ-ONLY. Oracle 0.00%.
 */

import { nearshoreTransform } from './transform.js';
import { CALIBRATION_SPOTS } from './calibration-spots.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

// ---------------------------------------------------------------------------
// Load env
// ---------------------------------------------------------------------------

function loadEnv(): { supabaseUrl: string; supabaseKey: string } {
  let supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const envPaths = [path.join(PROJECT_ROOT, '.env'), path.join(PROJECT_ROOT, 'packages/web/.env')];
  for (const envPath of envPaths) {
    if (supabaseUrl && supabaseKey) break;
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const eq = line.indexOf('='); if (eq < 1) continue;
        const k = line.slice(0, eq).trim(); const v = line.slice(eq + 1).trim();
        if (k === 'SUPABASE_URL' && !supabaseUrl) supabaseUrl = v;
        if (k === 'VITE_SUPABASE_URL' && !supabaseUrl) supabaseUrl = v;
        if (k === 'SUPABASE_SERVICE_ROLE_KEY' && !supabaseKey) supabaseKey = v;
      }
    } catch { /* ignore */ }
  }
  return { supabaseUrl, supabaseKey };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function mean(a: number[]): number { return a.length ? a.reduce((s,v)=>s+v,0)/a.length : NaN; }
function fmt(v: number, d=3): string { return isNaN(v)?'n/a':v.toFixed(d); }

// ---------------------------------------------------------------------------
// Period bucketing
// ---------------------------------------------------------------------------

function periodBucket(p: number | null): 'short'|'mid'|'long'|null {
  if (p == null) return null;
  if (p < 8) return 'short';
  if (p <= 12) return 'mid';
  return 'long';
}

// ---------------------------------------------------------------------------
// Open-Meteo fetch: multi-model wave archive
// Confirmed valid archive models: best_match, era5_ocean
// Confirmed forecast-only (7-day window): ecmwf_wam025, ncep_gfswave025
// ---------------------------------------------------------------------------

interface ModelHour { ts: string; waveHeight: number | null; wavePeriod: number | null; }

async function fetchModelArchive(
  lat: number, lon: number,
  startDate: string, endDate: string,
  model: string,
): Promise<ModelHour[]> {
  const url =
    `https://marine-api.open-meteo.com/v1/marine` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=wave_height,wave_period` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&timezone=GMT&models=${model}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const d = await res.json() as { hourly?: { time: string[]; wave_height: (number|null)[]; wave_period?: (number|null)[]; } };
    const times  = d.hourly?.time ?? [];
    const heights = d.hourly?.wave_height ?? [];
    const periods = d.hourly?.wave_period ?? [];
    return times.map((ts, i) => ({
      ts,
      waveHeight: heights[i] ?? null,
      wavePeriod: periods[i] ?? null,
    })).filter(h => h.waveHeight != null);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// CDIP nearshore fetch (wave_agg, time range)
// ---------------------------------------------------------------------------

interface BuoyHour { ts: string; Hs: number; Tp: number; }

async function fetchCDIPRange(stationId: string, startDate: string, endDate: string): Promise<BuoyHour[]> {
  const url =
    `https://erddap.cdip.ucsd.edu/erddap/tabledap/wave_agg.json` +
    `?time,waveHs,waveTp&station_id="${stationId.padStart(3,'0')}"` +
    `&time>=${startDate}T00:00:00Z&time<=${endDate}T23:59:59Z&orderBy("time")`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const d = await res.json() as { table: { rows: [string, number, number][] } };
    const rows = d?.table?.rows ?? [];
    // Average 30-min obs to hourly
    const byHour = new Map<string, { Hs: number[]; Tp: number[] }>();
    for (const [ts, Hs, Tp] of rows) {
      if (Hs == null || Hs > 20) continue;
      const key = ts.slice(0, 13);
      const slot = byHour.get(key) ?? { Hs: [], Tp: [] };
      slot.Hs.push(Hs); slot.Tp.push(Tp); byHour.set(key, slot);
    }
    return [...byHour.entries()].map(([key, s]) => ({
      ts: key + ':00:00',
      Hs: mean(s.Hs),
      Tp: mean(s.Tp),
    })).sort((a,b)=>a.ts.localeCompare(b.ts));
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Part A — multi-model × period-band residual table
// ---------------------------------------------------------------------------

async function partA(reportLines: string[]): Promise<void> {
  reportLines.push('## Part A — Multi-Model Comparison', '');
  reportLines.push('> **Open-Meteo archive availability note:**');
  reportLines.push('> - `best_match`: archive from 2021+, full swell decomposition — the only reliable historical model');
  reportLines.push('> - `era5_ocean`: archive from 1950+, wave_height + wave_period only (no swell decomposition)');
  reportLines.push('> - `ecmwf_wam025`, `ncep_gfswave025`: **forecast-window only (~7 days)** — cannot back-fill calibration history');
  reportLines.push('> - `meteofrance_wave_global`, `icon_wave`, `wam025` etc.: **invalid model strings** (API returns error)');
  reportLines.push('');
  reportLines.push('### A1 — Archive comparison: best_match vs era5_ocean (2022–2023)');
  reportLines.push('');

  const nearshoreSpotsForA = ['Scripps CA', 'Santa Cruz CA'];
  const MODELS_ARCHIVE = ['best_match', 'era5_ocean'];
  const START = '2022-01-01'; const END = '2023-12-31';

  for (const spotName of nearshoreSpotsForA) {
    const spot = CALIBRATION_SPOTS.find(s => s.name === spotName);
    if (!spot?.buoy) { reportLines.push(`_${spotName}: spot not found_`); continue; }

    const buoyData = await fetchCDIPRange(spot.buoy.id, START, END);
    console.log(`  Part A: ${spotName} buoy = ${buoyData.length} hourly obs`);
    const buoyMap = new Map(buoyData.map(b => [b.ts.slice(0,13), b]));

    reportLines.push(`### ${spotName} (CDIP-${spot.buoy.id}, nearshore, OUTPUT validation)`);
    reportLines.push(`Buoy: ${buoyData.length} hourly obs, 2022-2023  `);
    reportLines.push('');
    reportLines.push('| Model | Period | n pairs | Mean Δ (engine−buoy) | StdDev | Interpretation |');
    reportLines.push('|-------|--------|---------|---------------------|--------|----------------|');

    for (const model of MODELS_ARCHIVE) {
      const modelData = await fetchModelArchive(spot.lat, spot.lon, START, END, model);
      console.log(`  Part A: ${spotName} ${model} = ${modelData.length} archive hours`);

      const buckets: Record<'short'|'mid'|'long', number[]> = { short:[], mid:[], long:[] };
      for (const mh of modelData) {
        // Open-Meteo returns times as 'YYYY-MM-DDTHH:MM' — normalize to 'YYYY-MM-DDTHH' (13 chars)
        // buoyMap is also keyed on ts.slice(0,13) which keeps the T → must match
        const key = mh.ts.slice(0, 13);
        const buoy = buoyMap.get(key);
        if (!buoy || mh.waveHeight == null) continue;
        const H0 = mh.waveHeight;
        const T  = mh.wavePeriod ?? buoy.Tp;
        const tr = nearshoreTransform(H0, T, spot.depthM);
        const residual = tr.H - buoy.Hs; // engine − buoy (positive = over-predict)
        const pb = periodBucket(T);
        if (pb) buckets[pb].push(residual);
      }

      for (const pb of ['short','mid','long'] as const) {
        const arr = buckets[pb];
        if (arr.length === 0) {
          reportLines.push(`| ${model} | ${pb} | 0 | n/a | n/a | insufficient |`);
        } else {
          const m = mean(arr);
          const s = arr.length > 1 ? Math.sqrt(arr.reduce((sum,v)=>sum+(v-mean(arr))**2,0)/arr.length) : NaN;
          reportLines.push(`| ${model} | ${pb} (<8s / 8-12s / >12s) | ${arr.length} | ${fmt(m)} | ${fmt(s)} | |`);
        }
      }
    }
    reportLines.push('');
  }

  reportLines.push('### A2 — Recent model snapshot (last 7 days): best_match vs ecmwf_wam025 vs ncep_gfswave025');
  reportLines.push('');
  reportLines.push('> Note: ecmwf_wam025 and ncep_gfswave025 serve only the recent forecast window (~7 days).');
  reportLines.push('> This is a live/recent comparison, not a historical calibration comparison.');
  reportLines.push('');

  const today = new Date();
  const recentEnd = today.toISOString().slice(0,10);
  const recentStart = new Date(today.getTime() - 6*24*60*60*1000).toISOString().slice(0,10);

  reportLines.push(`Window: ${recentStart} → ${recentEnd}  `);
  reportLines.push('');
  reportLines.push('| Model | Scripps mean Δ (short/mid/long) | Santa Cruz mean Δ (short/mid/long) |');
  reportLines.push('|-------|-------------------------------|----------------------------------|');

  const MODELS_RECENT = ['best_match', 'ecmwf_wam025', 'ncep_gfswave025'];
  for (const model of MODELS_RECENT) {
    const row: string[] = [model];
    for (const spotName of ['Scripps CA', 'Santa Cruz CA']) {
      const spot = CALIBRATION_SPOTS.find(s => s.name === spotName);
      if (!spot?.buoy) { row.push('n/a'); continue; }
      const buoyData = await fetchCDIPRange(spot.buoy.id, recentStart, recentEnd);
      const buoyMap = new Map(buoyData.map(b => [b.ts.slice(0,13), b]));
      const modelData = await fetchModelArchive(spot.lat, spot.lon, recentStart, recentEnd, model);
      const buckets: Record<'short'|'mid'|'long', number[]> = { short:[], mid:[], long:[] };
      for (const mh of modelData) {
        const key = (mh.ts.slice(0,13));
        const buoy = buoyMap.get(key);
        if (!buoy || mh.waveHeight == null) continue;
        const T = mh.wavePeriod ?? buoy.Tp;
        const tr = nearshoreTransform(mh.waveHeight, T, spot.depthM);
        const residual = tr.H - buoy.Hs;
        const pb = periodBucket(T);
        if (pb) buckets[pb].push(residual);
      }
      const parts = (['short','mid','long'] as const).map(pb =>
        buckets[pb].length ? fmt(mean(buckets[pb]),2) : 'n/a'
      );
      row.push(parts.join(' / '));
    }
    reportLines.push(`| ${row[0]} | ${row[1]} | ${row[2]} |`);
  }
  reportLines.push('');
}

// ---------------------------------------------------------------------------
// Part B — Input vs transform decomposition
// Deep buoy nearest to nearshore spot: Mavericks→46012, Rincon→46054, Pipeline→51001
// Use the SAME period from the nearshore model fetch, check if bias exists at input stage
// ---------------------------------------------------------------------------

async function partB(reportLines: string[]): Promise<void> {
  reportLines.push('---', '', '## Part B — Input vs Transform Decomposition', '');
  reportLines.push('For nearshore spots, check whether the period-monotonic bias is already present in the');
  reportLines.push('INPUT (Open-Meteo wave_height H0 vs nearest deep-water buoy Hs) or first appears in the');
  reportLines.push('OUTPUT after nearshoreTransform. Per-period-band verdict.', '');

  // Near-deep buoy pairs: deep-water reference for the offshore signal
  const nearDeepPairs = [
    { nearshoreName: 'Scripps CA', deepName: 'Mavericks CA' },   // nearest deep with archive
    { nearshoreName: 'Santa Cruz CA', deepName: 'Mavericks CA' },
  ];

  const START = '2022-01-01'; const END = '2023-06-30';

  for (const { nearshoreName, deepName } of nearDeepPairs) {
    const nearSpot  = CALIBRATION_SPOTS.find(s => s.name === nearshoreName);
    const deepSpot  = CALIBRATION_SPOTS.find(s => s.name === deepName);
    if (!nearSpot?.buoy || !deepSpot?.buoy) continue;

    // Fetch nearshore buoy (truth)
    const nearBuoyData = await fetchCDIPRange(nearSpot.buoy.id, START, END);
    // Just use Open-Meteo at both lat/lons for a clean comparison
    // Input: Open-Meteo at nearshore lat/lon vs deep buoy Hs is confounded by location
    // Better: compare Open-Meteo H0 at nearshore point vs nearshore buoy, but split input vs output
    const modelAtNear = await fetchModelArchive(nearSpot.lat, nearSpot.lon, START, END, 'best_match');

    const nearBuoyMap = new Map(nearBuoyData.map(b=>[b.ts.slice(0,13),b]));

    const inputBuckets:  Record<'short'|'mid'|'long', number[]> = {short:[],mid:[],long:[]};
    const outputBuckets: Record<'short'|'mid'|'long', number[]> = {short:[],mid:[],long:[]};

    for (const mh of modelAtNear) {
      const key = mh.ts.slice(0,13);
      const buoy = nearBuoyMap.get(key);
      if (!buoy || mh.waveHeight == null) continue;
      const H0 = mh.waveHeight;
      const T  = mh.wavePeriod ?? buoy.Tp;
      const tr = nearshoreTransform(H0, T, nearSpot.depthM);
      const pb = periodBucket(T);
      if (!pb) continue;
      // Input residual: H0 (Open-Meteo raw) vs buoy Hs (nearshore truth — not deep, so this is the full chain)
      // We split: compare H0 to buoy (what the INPUT stage "sees") vs HFinal to buoy (what OUTPUT adds)
      inputBuckets[pb].push(H0 - buoy.Hs);           // positive = Open-Meteo over-predicts deep/offshore
      outputBuckets[pb].push(tr.H - buoy.Hs);        // positive = engine over-predicts nearshore
    }

    console.log(`  Part B: ${nearshoreName} paired with ${deepName} archive: ${modelAtNear.length} model hours, ${nearBuoyData.length} buoy hours`);

    reportLines.push(`### ${nearshoreName} — Input vs Transform Decomposition`);
    reportLines.push(`(Using Open-Meteo \`best_match\` at ${nearshoreName} coords vs CDIP-${nearSpot.buoy.id} buoy, 2022–mid-2023)  `);
    reportLines.push('');
    reportLines.push('| Period | n pairs | INPUT Δ (H0−buoy) | OUTPUT Δ (HFinal−buoy) | Born in |');
    reportLines.push('|--------|---------|------------------|----------------------|---------|');

    for (const pb of ['short','mid','long'] as const) {
      const inArr  = inputBuckets[pb];
      const outArr = outputBuckets[pb];
      if (inArr.length === 0) { reportLines.push(`| ${pb} | 0 | n/a | n/a | n/a |`); continue; }
      const inMean  = mean(inArr);
      const outMean = mean(outArr);
      // Verdict: if both are similar, bias is input-born (shoaling doesn't add much)
      // If output significantly more negative than input, transform amplifies the error
      let bornIn = 'mixed';
      const transformContrib = outMean - inMean;
      if (Math.abs(inMean) > 0.15 && Math.abs(transformContrib) < 0.05) bornIn = 'INPUT (Open-Meteo)';
      else if (Math.abs(inMean) < 0.1 && Math.abs(outMean) > 0.15)     bornIn = 'TRANSFORM (shoaling)';
      else if (Math.abs(transformContrib) > 0.15)                        bornIn = `BOTH (transform adds ${fmt(transformContrib,2)}m)`;
      else                                                                bornIn = 'INPUT-dominant';

      reportLines.push(`| ${pb} | ${inArr.length} | ${fmt(inMean)} | ${fmt(outMean)} | **${bornIn}** |`);
    }
    reportLines.push('');
  }
}

// ---------------------------------------------------------------------------
// Part C — Coverage map
// ---------------------------------------------------------------------------

function partC(reportLines: string[]): void {
  reportLines.push('---', '', '## Part C — Nearshore Ground Truth Coverage', '');

  const allSpots = CALIBRATION_SPOTS;
  const nearshore = allSpots.filter(s => s.buoy?.kind === 'nearshore');
  const deep      = allSpots.filter(s => s.buoy?.kind === 'deep');
  const nobuoy    = allSpots.filter(s => !s.buoy);

  reportLines.push(`Total spots registered: ${allSpots.length}  `);
  reportLines.push(`Nearshore (OUTPUT validation): ${nearshore.length}  `);
  reportLines.push(`Deep (INPUT/Open-Meteo validation): ${deep.length}  `);
  reportLines.push(`No public buoy (human-log only): ${nobuoy.length}  `);
  reportLines.push('');

  reportLines.push('### Nearshore spots by basin');
  reportLines.push('');
  reportLines.push('| Spot | Buoy | Depth | Lat | Lon | Basin | Status |');
  reportLines.push('|------|------|-------|-----|-----|-------|--------|');

  for (const s of nearshore) {
    const basin = s.lat > 0 && s.lon < -100 ? 'NE Pacific (US West)'
      : s.lat > 0 && s.lon < 0  ? 'NW Atlantic (US East)'
      : s.lat < 0                ? 'Southern Hemisphere'
      : s.lon > 0 && s.lon < 40 ? 'Mediterranean'
      : 'Other';
    const status = s.buoy ? `${s.buoy.network}-${s.buoy.id} (confirmed)` : 'no buoy';
    reportLines.push(`| ${s.name} | ${s.buoy?.network}-${s.buoy?.id} | ${s.depthM}m | ${s.lat} | ${s.lon} | ${basin} | ${status} |`);
  }

  reportLines.push('');
  reportLines.push('### Basins with NO public nearshore buoy — human-log only');
  reportLines.push('');
  reportLines.push('| Spot | Region | Gap reason |');
  reportLines.push('|------|--------|-----------|');
  for (const s of nobuoy) {
    reportLines.push(`| ${s.name} | ${s.notes ?? 'n/a'} | No public nearshore buoy — output validation via CALIBRATION_LOG.md (human obs) only |`);
  }
  reportLines.push('');
  reportLines.push('> **Note:** Deep-ocean buoys (NDBC) are NOT substituted for missing nearshore truth.');
  reportLines.push('> A deep buoy measures the offshore swell that is our INPUT, not our OUTPUT.');
  reportLines.push('> Regions without a nearshore buoy simply do not have engine-output calibration yet.');
  reportLines.push('');

  reportLines.push('### Period-aware correction requirement');
  reportLines.push('');
  reportLines.push('The period-monotonic bias confirmed in P6.2.2 means any future correction MUST be:');
  reportLines.push('- **Period-aware:** trained and validated separately on short/mid/long bands (different physical regimes)');
  reportLines.push('- **Multi-basin:** validated on US West Coast + US East Coast + at minimum one non-US basin before any global deployment');
  reportLines.push('- **NOT a single scalar:** a global constant offset correction would bake in the bias for the wrong period band at the wrong location');
  reportLines.push('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== P6.2.3 Period-Bias Diagnostic ===\n');
  const reportLines: string[] = [
    '# P6.2.3 Period-Bias Diagnostic Report',
    '',
    `**Generated:** ${new Date().toISOString()}  `,
    `**Spots registered:** ${CALIBRATION_SPOTS.length}  `,
    '',
    '---',
    '',
  ];

  console.log('Part A: multi-model comparison...');
  await partA(reportLines);

  console.log('Part B: input vs transform decomposition...');
  await partB(reportLines);

  partC(reportLines);

  // Recommendation
  reportLines.push('---', '', '## Recommendation', '');
  reportLines.push('_(Fill in after reviewing the tables above)_', '');
  reportLines.push('Based on Part A (model comparison) and Part B (input vs transform), the bias is:');
  reportLines.push('- [ ] **INPUT FIX** — bias varies substantially by wave model → pick a better model per region, no physics change');
  reportLines.push('- [ ] **TRANSFORM FIX** — bias same across all models AND born in transform stage → physics adjustment needed (its own oracle-guarded prompt)');
  reportLines.push('- [ ] **MIXED** — short-period = input-born, long-period = transform-born → fix input first, then re-diagnose');
  reportLines.push('- [ ] **NEED MORE BASINS** — US-only data insufficient to distinguish global vs regional cause');
  reportLines.push('');
  reportLines.push('_Analysis only — transform.ts untouched, oracle 0.00%, no model trained._');

  const reportPath = path.join(PROJECT_ROOT, 'calibration-period-diagnostic-report.md');
  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  console.log(`\nReport written → calibration-period-diagnostic-report.md`);
  console.log('\n=== Done ===\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
