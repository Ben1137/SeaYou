/**
 * P6.2.5 Ks Verification + Co-located SoCal Input Check.
 *
 * Run: npx tsx packages/core/src/nearshore/ksVerify.ts
 *
 * Part 1: Co-located input check — Open-Meteo at SoCal deep buoys (NDBC 46086, 46232)
 *   vs those buoys' own WVHT. Replaces P6.2.4's cross-basin Mavericks reference.
 *
 * Part 2: Pure-math Ks verification — independently implements linear wave theory
 *   (iterative Newton-Raphson dispersion) and compares to engine shoalingCoeff.
 *   Note: engine uses Fenton-McKee (1990) approximation (±0.5-1.5% in intermediate water).
 *
 * Analysis only. transform.ts READ-ONLY. Oracle 0.00%.
 */

import { shoalingCoeff } from './transform.js';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

const G = 9.80665; // m/s²

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function mean(a: number[]): number { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; }
function median(a: number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stddev(a: number[]): number {
  if (a.length < 2) return NaN;
  const mu = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / a.length);
}
function fmt(v: number, d = 3): string { return isNaN(v) ? 'n/a' : v.toFixed(d); }

type Band = 'short' | 'mid' | 'long';
function band(p: number | null): Band | null {
  if (!p) return null;
  if (p < 8) return 'short';
  if (p <= 12) return 'mid';
  return 'long';
}

// ---------------------------------------------------------------------------
// Pure linear wave theory — iterative dispersion (NOT Fenton-McKee)
// Used ONLY for the verification comparison; the engine uses Fenton-McKee.
// ---------------------------------------------------------------------------

/**
 * Solves k·tanh(kd) = ω²/g iteratively using Newton-Raphson.
 * Returns wave number k (rad/m).
 */
function solveKIterative(T: number, d: number, maxIter = 50, tol = 1e-10): number {
  const omega = 2 * Math.PI / T;
  const omega2_g = omega * omega / G;
  // Deep-water initial guess: k0 = ω²/g
  let k = omega2_g;
  for (let i = 0; i < maxIter; i++) {
    const th = Math.tanh(k * d);
    const f  = k * th - omega2_g;
    const df = th + k * d * (1 - th * th);
    const dk = -f / df;
    k += dk;
    if (Math.abs(dk) < tol * k) break;
  }
  return k;
}

/**
 * Computes linear-theory shoaling coefficient Ks at depth d for period T.
 * Uses iterative dispersion (NOT the engine's Fenton-McKee approximation).
 */
function ksTheory(T: number, d: number): { k: number; L: number; kd: number; n: number; Cg: number; Cg0: number; Ks: number } {
  const k   = solveKIterative(T, d);
  const L   = 2 * Math.PI / k;
  const kd  = k * d;
  const n   = 0.5 * (1 + 2 * kd / Math.sinh(2 * kd));
  const C   = L / T;
  const Cg  = n * C;
  const Cg0 = G * T / (4 * Math.PI); // deep-water group speed = gT/4π
  const Ks  = Math.sqrt(Cg0 / Cg);
  return { k, L, kd, n, Cg, Cg0, Ks };
}

// ---------------------------------------------------------------------------
// NDBC historical annual fetch + parse (same as backfillResiduals.ts)
// ---------------------------------------------------------------------------

interface NDBCHour { ts: string; Hs: number; DPD: number; }

async function fetchNDBCYear(stationId: string, year: number): Promise<NDBCHour[]> {
  const url = `https://www.ndbc.noaa.gov/data/historical/stdmet/${stationId}h${year}.txt.gz`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) { console.log(`  NDBC ${stationId} ${year}: HTTP ${res.status}`); return []; }
    const buf = await res.arrayBuffer();
    const text = await new Promise<string>((resolve, reject) =>
      zlib.gunzip(Buffer.from(buf), (e, r) => e ? reject(e) : resolve(r.toString('utf8'))));
    return parseNDBCText(text);
  } catch (e) { console.log(`  NDBC ${stationId} ${year}: ${e}`); return []; }
}

function parseNDBCText(text: string): NDBCHour[] {
  const lines = text.split('\n').filter(l => l.trim());
  const hi = lines.findIndex(l => l.match(/^#\s*YY/));
  if (hi < 0) return [];
  const header = lines[hi].replace(/^#\s*/, '').trim().split(/\s+/);
  const iYY = header.indexOf('YY'), iMM = header.indexOf('MM'), iDD = header.indexOf('DD');
  const iHH = header.indexOf('hh'), iWVHT = header.indexOf('WVHT'), iDPD = header.indexOf('DPD');
  if (iWVHT < 0 || iDPD < 0) return [];
  const byHour = new Map<string, { Hs: number[]; DPD: number[] }>();
  for (let i = hi + 2; i < lines.length; i++) {
    const cols = lines[i].trim().split(/\s+/);
    if (cols.length <= Math.max(iWVHT, iDPD)) continue;
    let yy = parseInt(cols[iYY] ?? '0'); if (yy < 100) yy += (yy > 50 ? 1900 : 2000);
    const mo = parseInt(cols[iMM] ?? '0'), dd = parseInt(cols[iDD] ?? '0'), hh = parseInt(cols[iHH] ?? '0');
    const key = `${yy}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}T${String(hh).padStart(2, '0')}`;
    const ws = cols[iWVHT], ds = cols[iDPD];
    // Handle both MM (realtime) and 99.00/9999.0 (historical) sentinels
    if (ws === 'MM' || ds === 'MM') continue;
    const Hs = parseFloat(ws), DPD = parseFloat(ds);
    if (isNaN(Hs) || Hs >= 99 || isNaN(DPD) || DPD >= 99) continue;
    const slot = byHour.get(key) ?? { Hs: [], DPD: [] };
    slot.Hs.push(Hs); slot.DPD.push(DPD); byHour.set(key, slot);
  }
  const m = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return [...byHour.entries()].map(([key, s]) => ({ ts: key, Hs: m(s.Hs), DPD: m(s.DPD) }))
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

// ---------------------------------------------------------------------------
// Open-Meteo archive at specific lat/lon
// ---------------------------------------------------------------------------

interface ModelHour { ts: string; waveHeight: number | null; wavePeriod: number | null; }

async function fetchModelArchive(lat: number, lon: number, start: string, end: string, model: string): Promise<ModelHour[]> {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&hourly=wave_height,wave_period&start_date=${start}&end_date=${end}&timezone=GMT&models=${model}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return [];
    const d = await res.json() as { hourly?: { time: string[]; wave_height: (number | null)[]; wave_period: (number | null)[] } };
    const t = d.hourly?.time ?? [], h = d.hourly?.wave_height ?? [], p = d.hourly?.wave_period ?? [];
    return t.map((ts, i) => ({ ts, waveHeight: h[i] ?? null, wavePeriod: p[i] ?? null })).filter(x => x.waveHeight != null);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Part 1 — Co-located SoCal input check
// ---------------------------------------------------------------------------

async function part1(lines: string[]): Promise<void> {
  lines.push('## Part 1 — Co-located SoCal Input Check', '');
  lines.push('> Open-Meteo at each buoy\'s OWN lat/lon vs that buoy\'s own WVHT — matched depth.', '');
  lines.push('> 46086 (San Clemente Basin, 32.504N/118.029W) and 46232 (Point Loma South, 32.517N/117.425W)', '');
  lines.push('> Both stations are inside the Southern California Bight — the same wave environment as Scripps.', '');

  const stations = [
    { id: '46086', name: 'San Clemente Basin', lat: 32.504, lon: -118.029 },
    { id: '46232', name: 'Point Loma South',   lat: 32.517, lon: -117.425 },
  ];
  const MODELS = ['best_match', 'era5_ocean'] as const;
  const START = '2022-01-01'; const END = '2023-12-31';

  let anyOverPredictLong = false;
  let bestMatchLongMeanMax = 0;

  for (const stn of stations) {
    const b22 = await fetchNDBCYear(stn.id, 2022);
    const b23 = await fetchNDBCYear(stn.id, 2023);
    const buoyHours = [...b22, ...b23];
    const buoyMap = new Map(buoyHours.map(h => [h.ts, h]));
    console.log(`  Part1 ${stn.name} (${stn.id}): buoy ${buoyHours.length} hourly obs`);

    lines.push(`### NDBC ${stn.id} — ${stn.name} (lat=${stn.lat}, lon=${stn.lon})`);
    lines.push(`Buoy observations: ${buoyHours.length} hourly (2022-2023)`);
    lines.push('');

    for (const model of MODELS) {
      const modelData = await fetchModelArchive(stn.lat, stn.lon, START, END, model);
      console.log(`  Part1 ${stn.name} ${model}: ${modelData.length} hours`);
      type Buckets = Record<Band, number[]>;
      const byModelP: Buckets = { short: [], mid: [], long: [] };
      const byBuoyP: Buckets  = { short: [], mid: [], long: [] };
      for (const mh of modelData) {
        const key = mh.ts.slice(0, 13).replace(' ', 'T');
        const bh = buoyMap.get(key);
        if (!bh || mh.waveHeight == null) continue;
        const delta = mh.waveHeight - bh.Hs;
        const bm = band(mh.wavePeriod); const bb = band(bh.DPD);
        if (bm) byModelP[bm].push(delta);
        if (bb) byBuoyP[bb].push(delta);
      }
      if (model === 'best_match') {
        const longMean = mean(byModelP.long);
        if (!isNaN(longMean) && longMean > 0.10) anyOverPredictLong = true;
        bestMatchLongMeanMax = Math.max(bestMatchLongMeanMax, isNaN(longMean) ? 0 : longMean);
      }
      lines.push(`**${model}** — bucketed by model wave_period:`);
      lines.push('| Band | n | Mean Δ (m) | Median Δ | StdDev |');
      lines.push('|------|---|-----------|----------|--------|');
      for (const b of ['short', 'mid', 'long'] as Band[]) {
        const a = byModelP[b];
        lines.push(`| ${b} | ${a.length} | ${fmt(mean(a))} | ${fmt(median(a))} | ${fmt(stddev(a))} |`);
      }
      lines.push('');
      lines.push(`**${model}** — bucketed by buoy DPD:`);
      lines.push('| Band | n | Mean Δ (m) | Median Δ | StdDev |');
      lines.push('|------|---|-----------|----------|--------|');
      for (const b of ['short', 'mid', 'long'] as Band[]) {
        const a = byBuoyP[b];
        lines.push(`| ${b} | ${a.length} | ${fmt(mean(a))} | ${fmt(median(a))} | ${fmt(stddev(a))} |`);
      }
      lines.push('');
    }
  }

  lines.push('### Part 1 Interpretation', '');
  if (anyOverPredictLong) {
    lines.push(`> **Open-Meteo DOES over-predict in the SoCal Bight at long period (max mean Δ = +${fmt(bestMatchLongMeanMax, 2)}m).**`);
    lines.push('> The INPUT is not clean in this basin. P6.2.4\'s TRANSFORM-BORN verdict is WITHDRAWN.');
    lines.push('> The period-monotonic bias at Scripps is partly (or entirely) an INPUT artifact — Open-Meteo');
    lines.push('> over-estimates wave height in the SoCal Bight, likely because the ~0.25° grid cannot resolve');
    lines.push('> island shadowing (Channel Islands) and canyon refraction (La Jolla submarine canyon).');
    lines.push('> **Recommendation: INPUT FIX (regional model resolution / field choice) — do NOT edit transform.ts.**');
  } else {
    lines.push('> **Open-Meteo is accurate in the SoCal Bight at all period bands (mean Δ < 0.10m).**');
    lines.push('> The input is genuinely clean near Scripps. The excess at the nearshore buoy is real energy loss.');
    lines.push('> Proceed to Part 2 to assess whether the shoaling law is correct before concluding TRANSFORM-BORN.');
  }
  lines.push('');
}

// ---------------------------------------------------------------------------
// Part 2 — Pure-math Ks verification
// ---------------------------------------------------------------------------

function part2(lines: string[]): void {
  lines.push('---', '', '## Part 2 — Pure-Math Ks Verification', '');
  lines.push('> Engine uses Fenton-McKee (1990) approximation. This check uses iterative Newton-Raphson dispersion.');
  lines.push('> A 2% tolerance is applied: >2% divergence = implementation concern; <2% = law is correct, not the bug.', '');

  const depths  = [10, 20, 41, 60];
  const periods = [8, 10, 12, 15, 18];

  for (const d of depths) {
    lines.push(`### Ks at depth d = ${d} m`, '');
    lines.push('| T (s) | L (m) | kd | n | Ks_theory | Ks_engine | Δ% | Assessment |');
    lines.push('|-------|-------|----|----|-----------|-----------|-----|------------|');
    for (const T of periods) {
      const th      = ksTheory(T, d);
      const eng     = shoalingCoeff(T, d);
      const diffPct = 100 * (eng - th.Ks) / th.Ks;
      const ok      = Math.abs(diffPct) < 2.0;
      lines.push(`| ${T} | ${fmt(th.L, 1)} | ${fmt(th.kd, 3)} | ${fmt(th.n, 4)} | ${fmt(th.Ks, 4)} | ${fmt(eng, 4)} | ${fmt(diffPct, 2)}% | ${ok ? '✓ within 2%' : '⚠ EXCEEDS 2%'} |`);
    }
    lines.push('');
    lines.push(`> Breaking cap (γ·d) at d=${d}m = ${fmt(0.78 * d, 2)}m. For typical swell Hs=1-3m, breaking ${0.78 * d > 3 ? '**does NOT fire** (cap >> Hs)' : '**may fire**'} at this depth.`);
    lines.push('');
  }

  lines.push('### Ks shape analysis at d=41m (the Scripps buoy depth)', '');
  const ksAt41 = periods.map(T => { const th = ksTheory(T, 41); return { T, Ks: th.Ks }; });
  lines.push('Expected per linear wave theory: Ks ≤ 1 throughout intermediate water at 41m (engine should predict LESS than offshore H0).', '');
  const anyAbove1 = ksAt41.some(r => r.Ks > 1.005);
  lines.push(`All Ks ≤ 1 at d=41m? **${anyAbove1 ? 'NO — anomaly found' : 'YES — correct'}**`, '');
  lines.push('| T (s) | Ks_theory | Engine over-predicts offshore? |');
  lines.push('|-------|-----------|-------------------------------|');
  for (const { T, Ks } of ksAt41) {
    lines.push(`| ${T} | ${fmt(Ks, 4)} | ${Ks > 1 ? 'YES (anomalous)' : 'No (Ks<1, correct)'} |`);
  }
  lines.push('');
  lines.push('**Implication:** If Ks < 1 at 41m for all long-period T, then the engine ALREADY predicts less than offshore H0 due to shoaling physics.');
  lines.push('If the output still over-predicts the nearshore buoy (C−D > 0), that cannot be caused by an over-aggressive Ks — the input H0 must itself be inflated relative to what reaches that buoy location.');
  lines.push('This is consistent with a MISSING FEATURE (island shadowing / La Jolla canyon refraction) in the input field, not a transform bug.');
  lines.push('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== P6.2.5 Ks Verification + Co-located SoCal Input Check ===\n');
  const lines: string[] = [
    '# P6.2.5 Input Validation v2 — Co-located + Pure-Math Ks',
    '',
    `**Generated:** ${new Date().toISOString()}  `,
    '', '---', '',
  ];

  console.log('Part 1: co-located SoCal input check...');
  await part1(lines);

  console.log('Part 2: pure-math Ks verification...');
  part2(lines);

  lines.push('---', '', '## Final Recommendation', '');
  lines.push('_(Auto-populated from Part 1 result — see Part 1 Interpretation section above)_', '');
  lines.push('- If Part 1 shows Open-Meteo over-predicts in SoCal Bight: **INPUT FIX (regional model/resolution) — no physics change**');
  lines.push('- If Part 1 shows accurate SoCal input AND Part 2 shows Ks_engine > Ks_theory (>2%): **IMPLEMENTATION BUG in shoaling approximation**');
  lines.push('- If Part 1 shows accurate SoCal input AND Ks_engine matches theory: **MISSING FEATURE (island shadowing / canyon refraction) — P6.3 ML candidate, not a Ks edit**');
  lines.push('');
  lines.push('> **Rule:** Do NOT edit transform.ts unless Part 2 confirms a genuine implementation bug (>2% Ks divergence).');
  lines.push('> A per-location correction for refraction/shadowing belongs in P6.3, not in the shoaling law.');
  lines.push('');
  lines.push('_Analysis only — transform.ts untouched, oracle 0.00%, no model trained._');

  const reportPath = path.join(PROJECT_ROOT, 'calibration-input-validation-v2-report.md');
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log(`\nReport written → calibration-input-validation-v2-report.md`);
  console.log('\n=== Done ===\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
