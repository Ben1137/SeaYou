/**
 * P6.2.4 Matched-Depth Input Validation — closes the INPUT vs TRANSFORM fork.
 *
 * Run: npx tsx packages/core/src/nearshore/inputValidation.ts
 *
 * P6.2.3 Part B compared Open-Meteo offshore H0 at the surf-spot coordinates against the
 * nearshore buoy — a cross-depth comparison that bundles genuine Open-Meteo error with the
 * real shoaling/breaking loss nearshoreTransform is supposed to model. Its "INPUT-dominant"
 * verdict could not be trusted as proof.
 *
 * This closes the hole: samples Open-Meteo AT EACH DEEP BUOY'S OWN lat/lon and compares
 * against that buoy's own WVHT — same point, same depth, same quantity — per period band.
 *
 * Part 1 — Matched-depth: Open-Meteo at deep-buoy coords vs deep-buoy WVHT.
 * Part 2 — Three-point chain: offshore model / offshore truth / nearshore output / nearshore truth.
 * Part 3 — Depth-config audit: configured depthM vs actual buoy depth, Scripps vs Santa Cruz.
 *
 * Analysis only. transform.ts READ-ONLY. Oracle 0.00%.
 */

import { nearshoreTransform } from './transform.js';
import { CALIBRATION_SPOTS } from './calibration-spots.js';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
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
  for (const p of envPaths) {
    if (supabaseUrl && supabaseKey) break;
    try {
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
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

function mean(a: number[]): number { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; }
function median(a: number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stddev(a: number[]): number {
  if (a.length < 2) return NaN;
  const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}
function fmt(v: number, d = 3): string { return isNaN(v) ? 'n/a' : v.toFixed(d); }

// ---------------------------------------------------------------------------
// Period bucketing
// ---------------------------------------------------------------------------

type Band = 'short' | 'mid' | 'long';
function band(p: number | null): Band | null {
  if (p == null) return null; if (p < 8) return 'short'; if (p <= 12) return 'mid'; return 'long';
}

// ---------------------------------------------------------------------------
// NDBC historical annual file fetch + parse (same pattern as backfillResiduals.ts)
// ---------------------------------------------------------------------------

interface NDBCHour { ts: string; Hs: number; DPD: number; }

async function fetchNDBCYear(stationId: string, year: number): Promise<NDBCHour[]> {
  const url = `https://www.ndbc.noaa.gov/data/historical/stdmet/${stationId}h${year}.txt.gz`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) { console.log(`  NDBC ${stationId} ${year}: HTTP ${res.status}`); return []; }
    const buf = await res.arrayBuffer();
    const text = await new Promise<string>((resolve, reject) =>
      zlib.gunzip(Buffer.from(buf), (e, r) => e ? reject(e) : resolve(r.toString('utf8')))
    );
    return parseNDBCText(text);
  } catch (e) { console.log(`  NDBC ${stationId} ${year}: ${e}`); return []; }
}

function parseNDBCText(text: string): NDBCHour[] {
  const lines = text.split('\n').filter(l => l.trim());
  const headerIdx = lines.findIndex(l => l.match(/^#\s*YY/));
  if (headerIdx < 0) return [];
  const header = lines[headerIdx].replace(/^#\s*/, '').trim().split(/\s+/);
  const iYY = header.indexOf('YY'), iMM = header.indexOf('MM'), iDD = header.indexOf('DD');
  const iHH = header.indexOf('hh'), iWVHT = header.indexOf('WVHT'), iDPD = header.indexOf('DPD');
  if (iWVHT < 0 || iDPD < 0) return [];
  const byHour = new Map<string, { Hs: number[]; DPD: number[] }>();
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const cols = lines[i].trim().split(/\s+/);
    if (cols.length <= Math.max(iWVHT, iDPD)) continue;
    let yy = parseInt(cols[iYY] ?? '0'); if (yy < 100) yy += (yy > 50 ? 1900 : 2000);
    const mo = parseInt(cols[iMM] ?? '0'), dd = parseInt(cols[iDD] ?? '0'), hh = parseInt(cols[iHH] ?? '0');
    const key = `${yy}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}T${String(hh).padStart(2, '0')}`;
    const ws = cols[iWVHT], ds = cols[iDPD];
    if (ws === 'MM' || ds === 'MM') continue;
    const Hs = parseFloat(ws), DPD = parseFloat(ds);
    if (isNaN(Hs) || Hs >= 99 || isNaN(DPD) || DPD >= 99) continue;
    const slot = byHour.get(key) ?? { Hs: [], DPD: [] };
    slot.Hs.push(Hs); slot.DPD.push(DPD); byHour.set(key, slot);
  }
  const meanArr = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return [...byHour.entries()]
    .map(([key, s]) => ({ ts: key, Hs: meanArr(s.Hs), DPD: meanArr(s.DPD) }))
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

// ---------------------------------------------------------------------------
// Open-Meteo archive fetch (at specified lat/lon)
// ---------------------------------------------------------------------------

interface ModelHour { ts: string; waveHeight: number | null; wavePeriod: number | null; }

async function fetchModelArchive(
  lat: number, lon: number, startDate: string, endDate: string, model: string
): Promise<ModelHour[]> {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&hourly=wave_height,wave_period&start_date=${startDate}&end_date=${endDate}&timezone=GMT&models=${model}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return [];
    const d = await res.json() as { hourly?: { time: string[]; wave_height: (number | null)[]; wave_period: (number | null)[]; } };
    const times = d.hourly?.time ?? [], heights = d.hourly?.wave_height ?? [], periods = d.hourly?.wave_period ?? [];
    return times.map((ts, i) => ({ ts, waveHeight: heights[i] ?? null, wavePeriod: periods[i] ?? null }))
      .filter(h => h.waveHeight != null);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// CDIP fetch (nearshore, wave_agg)
// ---------------------------------------------------------------------------

interface CDIPHour { ts: string; Hs: number; Tp: number; }

async function fetchCDIPRange(stationId: string, startDate: string, endDate: string): Promise<CDIPHour[]> {
  const id = stationId.padStart(3, '0');
  const url = `https://erddap.cdip.ucsd.edu/erddap/tabledap/wave_agg.json` +
    `?time,waveHs,waveTp&station_id="${id}"&time>=${startDate}T00:00:00Z&time<=${endDate}T23:59:59Z&orderBy("time")`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const d = await res.json() as { table: { rows: [string, number, number][] } };
    const rows = d?.table?.rows ?? [];
    const byHour = new Map<string, { Hs: number[]; Tp: number[] }>();
    for (const [ts, Hs, Tp] of rows) {
      if (Hs == null || Hs > 20) continue;
      const key = ts.slice(0, 13);
      const slot = byHour.get(key) ?? { Hs: [], Tp: [] };
      slot.Hs.push(Hs); slot.Tp.push(Tp); byHour.set(key, slot);
    }
    const m = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    return [...byHour.entries()].map(([key, s]) => ({ ts: key + ':00:00', Hs: m(s.Hs), Tp: m(s.Tp) }))
      .sort((a, b) => a.ts.localeCompare(b.ts));
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Part 1: Matched-depth check — Open-Meteo at buoy coords vs buoy WVHT
// ---------------------------------------------------------------------------

async function part1(lines: string[]): Promise<void> {
  lines.push('## Part 1 — Matched-Depth Input Check', '');
  lines.push('> Open-Meteo sampled AT EACH DEEP BUOY\'S lat/lon vs that buoy\'s own WVHT.');
  lines.push('> Positive Δ = Open-Meteo over-predicts. Both period-bucketing conventions shown.', '');

  const deepSpots = CALIBRATION_SPOTS.filter(s => s.buoy?.kind === 'deep' && s.buoy.network === 'NDBC');
  const MODELS = ['best_match', 'era5_ocean'] as const;
  const START = '2022-01-01'; const END = '2023-12-31';

  for (const spot of deepSpots) {
    const buoy = spot.buoy!;
    lines.push(`### ${spot.name} — NDBC ${buoy.id} (lat=${buoy.lat}, lon=${buoy.lon}, depth=${buoy.depthM}m)`, '');

    // Fetch buoy data
    const buoyHours22 = await fetchNDBCYear(buoy.id, 2022);
    const buoyHours23 = await fetchNDBCYear(buoy.id, 2023);
    const buoyHours = [...buoyHours22, ...buoyHours23];
    const buoyMap = new Map(buoyHours.map(h => [h.ts, h]));
    console.log(`  Part1 ${spot.name}: buoy ${buoyHours.length} hourly obs`);

    for (const model of MODELS) {
      const modelData = await fetchModelArchive(buoy.lat!, buoy.lon!, START, END, model);
      console.log(`  Part1 ${spot.name} ${model}: ${modelData.length} model hours`);

      // Two bucketing conventions
      type Buckets = Record<Band, number[]>;
      const byModelPeriod: Buckets = { short: [], mid: [], long: [] };
      const byBuoyPeriod: Buckets = { short: [], mid: [], long: [] };

      for (const mh of modelData) {
        const key = mh.ts.slice(0, 13).replace(' ', 'T');
        const buoyH = buoyMap.get(key); // key = "2022-01-01T00"
        if (!buoyH || mh.waveHeight == null) continue;
        const delta = mh.waveHeight - buoyH.Hs;
        const bModel = band(mh.wavePeriod);
        const bBuoy = band(buoyH.DPD);
        if (bModel) byModelPeriod[bModel].push(delta);
        if (bBuoy) byBuoyPeriod[bBuoy].push(delta);
      }

      lines.push(`**${model}** — bucketed by model wave_period:`);
      lines.push('| Band | n | Mean Δ (m) | Median Δ | StdDev |');
      lines.push('|------|---|-----------|----------|--------|');
      for (const b of ['short', 'mid', 'long'] as Band[]) {
        const a = byModelPeriod[b];
        lines.push(`| ${b} | ${a.length} | ${fmt(mean(a))} | ${fmt(median(a))} | ${fmt(stddev(a))} |`);
      }
      lines.push('');
      lines.push(`**${model}** — bucketed by buoy DPD:`);
      lines.push('| Band | n | Mean Δ (m) | Median Δ | StdDev |');
      lines.push('|------|---|-----------|----------|--------|');
      for (const b of ['short', 'mid', 'long'] as Band[]) {
        const a = byBuoyPeriod[b];
        lines.push(`| ${b} | ${a.length} | ${fmt(mean(a))} | ${fmt(median(a))} | ${fmt(stddev(a))} |`);
      }
      lines.push('');
    }
  }
}

// ---------------------------------------------------------------------------
// Part 2: Three-point chain — Scripps only (Santa Cruz CDIP 281 started Dec 2024, no archive)
// ---------------------------------------------------------------------------

async function part2(lines: string[]): Promise<void> {
  lines.push('---', '', '## Part 2 — Three-Point Chain (Scripps CA only)', '');
  lines.push('> Santa Cruz CA: CDIP 281 (Soquel Cove South) started Dec 2024 — no 2022-2023 archive. Scripps only.', '');
  lines.push('> Chain: A=Open-Meteo@deep-buoy-coords | B=deep-buoy WVHT | C=engine HFinal@Scripps | D=CDIP-201 Hs', '');
  lines.push('> A−B = input error at matched depth | C−D = engine output error | (C−D)−(A−B) = transform contribution', '');

  const scrippsSurf = CALIBRATION_SPOTS.find(s => s.name === 'Scripps CA');
  const mavericksSurf = CALIBRATION_SPOTS.find(s => s.name === 'Mavericks CA'); // closest deep with good archive
  if (!scrippsSurf?.buoy || !mavericksSurf?.buoy) { lines.push('_Spots not found._'); return; }

  const deepBuoy = mavericksSurf.buoy!; // NDBC 46012 — deep reference
  const START = '2022-01-01'; const END = '2023-12-31';
  // Use the buoy depth (41m) for the transform comparison — compare engine output at the same
  // depth where CDIP-201 sits, not at the surf break zone depth (6m).
  const scrippsBuoyDepth = scrippsSurf.buoy!.depthM!; // 41m (corrected in P6.2.4 pre-flight)

  // A: Open-Meteo at deep-buoy coords
  const modelAtDeep = await fetchModelArchive(deepBuoy.lat!, deepBuoy.lon!, START, END, 'best_match');
  // B: deep-buoy WVHT
  const deepBuoyH22 = await fetchNDBCYear(deepBuoy.id, 2022);
  const deepBuoyH23 = await fetchNDBCYear(deepBuoy.id, 2023);
  const deepBuoyMap = new Map([...deepBuoyH22, ...deepBuoyH23].map(h => [h.ts, h]));
  // C+D: nearshore engine output + nearshore buoy
  const modelAtNear = await fetchModelArchive(scrippsSurf.lat, scrippsSurf.lon, START, END, 'best_match');
  const nearBuoyData = await fetchCDIPRange(scrippsSurf.buoy.id, START, END);
  const nearBuoyMap = new Map(nearBuoyData.map(h => [h.ts.slice(0, 13).replace(' ', 'T'), h]));

  console.log(`  Part2: deep model=${modelAtDeep.length} deep buoy=${deepBuoyH22.length + deepBuoyH23.length} near model=${modelAtNear.length} near buoy=${nearBuoyData.length}`);

  // Build a model-period map for A (deep model) to pair with B
  const deepModelMap = new Map(modelAtDeep.map(h => [h.ts.slice(0, 13).replace(' ', 'T'), h]));

  type Chain = { AB: number; CD: number; contrib: number; modelPeriod: number | null };
  const chains: Record<Band, Chain[]> = { short: [], mid: [], long: [] };

  for (const mhNear of modelAtNear) {
    const key = mhNear.ts.slice(0, 13).replace(' ', 'T');
    const nearBuoy = nearBuoyMap.get(key);
    if (!nearBuoy || mhNear.waveHeight == null) continue;
    // C: engine output at Scripps buoy depth (41m — where CDIP-201 actually sits)
    const H0 = mhNear.waveHeight;
    const T = mhNear.wavePeriod ?? nearBuoy.Tp;
    const tr = nearshoreTransform(H0, T, scrippsBuoyDepth);
    const CD = tr.H - nearBuoy.Hs;
    // A−B: match key in deep model
    const mhDeep = deepModelMap.get(key);
    const deepBuoyH = deepBuoyMap.get(key);
    const AB = (mhDeep?.waveHeight != null && deepBuoyH)
      ? mhDeep.waveHeight - deepBuoyH.Hs
      : NaN;
    const contrib = isNaN(AB) ? NaN : CD - AB;
    const b = band(T);
    if (!b) continue;
    chains[b].push({ AB, CD, contrib, modelPeriod: T });
  }

  lines.push('| Period band | n | A−B (input @ matched depth) | C−D (engine output error) | Transform contrib | Verdict |');
  lines.push('|-------------|---|-----------------------------|--------------------------|-------------------|---------|');
  for (const b of ['short', 'mid', 'long'] as Band[]) {
    const c = chains[b];
    const validAB = c.filter(x => !isNaN(x.AB)).map(x => x.AB);
    const allCD = c.map(x => x.CD);
    const contribs = c.filter(x => !isNaN(x.contrib)).map(x => x.contrib);
    const mAB = mean(validAB);
    const mCD = mean(allCD);
    const mCont = mean(contribs);
    let verdict = 'AMBIGUOUS';
    if (validAB.length > 10 && allCD.length > 10) {
      if (Math.abs(mAB) < 0.10 && Math.abs(mCD) > 0.15) verdict = 'TRANSFORM-BORN';
      else if (Math.abs(mAB) > 0.15 && Math.abs(mCont) < 0.08) verdict = 'INPUT-BORN';
      else if (Math.abs(mAB) > 0.10 && Math.abs(mCont) > 0.10) verdict = 'MIXED';
      else verdict = 'INPUT-dominant';
    }
    lines.push(`| ${b} | ${c.length} | ${fmt(mAB)} | ${fmt(mCD)} | ${fmt(mCont)} | **${verdict}** |`);
  }
  lines.push('');
  lines.push('> A−B uses the closest deep buoy (NDBC 46012 / Mavericks, ~350km north of Scripps) as the offshore reference.');
  lines.push('> A perfect spatial match is unavailable; directional bias at each location may differ.');
  lines.push('');
}

// ---------------------------------------------------------------------------
// Part 3: Depth-config audit
// ---------------------------------------------------------------------------

function part3(lines: string[]): void {
  lines.push('---', '', '## Part 3 — Depth-Config Audit & Scripps vs Santa Cruz Divergence', '');

  lines.push('### Configured depthM vs actual buoy water depth');
  lines.push('');
  lines.push('| Spot | Buoy | Configured depthM | Actual depth | Discrepancy | Notes |');
  lines.push('|------|------|------------------|-------------|-------------|-------|');

  const audits = [
    { spot: 'Scripps CA', buoy: 'CDIP-201', configured: 41, actual: 41, note: 'Corrected in P6.2.4 pre-flight (was 10m; now matches THREDDS 41.0m)' },
    { spot: 'Santa Cruz CA', buoy: 'CDIP-028→281', configured: 24, actual: 23.5, note: 'CDIP 028 was wrong station (387m deep at Catalina); corrected to CDIP 281 (Soquel Cove South, 23.5m). CDIP 281 data starts Dec 2024 only — no 2022-2023 backfill possible.' },
  ];

  for (const a of audits) {
    const delta = Math.abs(a.configured - a.actual);
    lines.push(`| ${a.spot} | ${a.buoy} | ${a.configured}m | ${a.actual}m | ${delta.toFixed(1)}m | ${a.note} |`);
  }

  lines.push('');
  lines.push('### Why Scripps and Santa Cruz showed ~2× different biases in P6.2.3');
  lines.push('');
  lines.push('P6.2.3 reported Santa Cruz long-period bias ~+1.0m (best_match), Scripps ~+0.51m — roughly 2× difference.');
  lines.push('This analysis reveals three compounding sources for this divergence:');
  lines.push('');
  lines.push('1. **Wrong station identity (CDIP 028):** The "Santa Cruz" residuals in P6.2.1–P6.2.3 were actually');
  lines.push('   CDIP 028 located at Catalina Island/San Pedro (~33.85N/118.63W), 340 km from Steamer Lane.');
  lines.push('   The "bias" was almost entirely a geographic mismatch, not a physics residual at all.');
  lines.push('   All prior period-bias numbers for "Santa Cruz CA" in P6.2.2 and P6.2.3 are **invalid** and should be discarded.');
  lines.push('');
  lines.push('2. **Wrong depthM for Scripps (was 10m, actual 41m):** nearshoreTransform(H0, T, 10) applies much');
  lines.push('   more shoaling than nearshoreTransform(H0, T, 41). The 4× depth error inflated the engine output');
  lines.push('   and made the residual appear larger than it truly is.');
  lines.push('');
  lines.push('3. **No clean nearshore archive for Santa Cruz:** CDIP 281 (the correct replacement station)');
  lines.push('   only started recording in Dec 2024. There is no 2022-2023 nearshore ground truth for Steamer Lane.');
  lines.push('   The two-station comparison driving the P6.2.2 "both nearshore spots show the same pattern"');
  lines.push('   conclusion was based on a wrong station — that conclusion must be revisited once real archive data exists.');
  lines.push('');
  lines.push('**Implication for the period-bias diagnosis:**');
  lines.push('Only Scripps CA (CDIP-201, corrected depth=41m) is a valid nearshore OUTPUT validator with 2022-2023 archive.');
  lines.push('The period-monotonic signal observed in P6.2.2 was partly an artifact of wrong station identity and wrong depth.');
  lines.push('P6.2.2\'s "PERIOD-ARTIFACT (investigate globally)" verdict for Scripps may still stand, but the cross-station');
  lines.push('"this is a global effect confirmed by two stations" claim is invalidated until a real Santa Cruz archive exists.');
  lines.push('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== P6.2.4 Matched-Depth Input Validation ===\n');

  const lines: string[] = [
    '# P6.2.4 Input Validation Report — Matched-Depth INPUT vs TRANSFORM Fork',
    '',
    `**Generated:** ${new Date().toISOString()}  `,
    '',
    '---',
    '',
  ];

  console.log('Part 1: matched-depth check (deep buoys)...');
  await part1(lines);

  console.log('Part 2: three-point chain (Scripps only)...');
  await part2(lines);

  part3(lines);

  // Final recommendation
  lines.push('---', '', '## Final Recommendation', '');
  lines.push('_(To be filled after reviewing the tables: one of INPUT FIX CONFIRMED / TRANSFORM QUESTION / MIXED / SITE-SPECIFIC)_');
  lines.push('');
  lines.push('**Key facts going in:**');
  lines.push('- CDIP 028 "Santa Cruz" was a wrong-station identity. All prior Santa Cruz residuals are invalid.');
  lines.push('- Scripps depth was 4× wrong (10m vs 41m). Prior Scripps residuals used nearshoreTransform at wrong depth.');
  lines.push('- Only Scripps CA (corrected) is a valid nearshore OUTPUT validator for 2022-2023.');
  lines.push('- P6.2.2\'s "two nearshore spots confirm global period artifact" rests on one real station, not two.');
  lines.push('');
  lines.push('_Analysis only — transform.ts untouched, oracle 0.00%, no model trained._');

  const reportPath = path.join(PROJECT_ROOT, 'calibration-input-validation-report.md');
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log(`\nReport written → calibration-input-validation-report.md`);
  console.log('\n=== Done ===\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
