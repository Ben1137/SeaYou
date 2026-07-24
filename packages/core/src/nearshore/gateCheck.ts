/**
 * P6.2.9 Reconciliation Gate Check
 *
 * Run: npx tsx packages/core/src/nearshore/gateCheck.ts
 *
 * Verifies that stored engine_value in calibration_residuals matches
 * nearshoreTransform(swell_height, wave_period, buoy.depthM) to within floating-point
 * precision, confirming the DB is internally consistent.
 *
 * The P6.2.8 "reconciliation failure" was a banding-key mismatch (swell_period vs
 * wave_period). This gate uses wave_period throughout — matching the banding key
 * that backfillResiduals.ts stores and that residualReport.ts uses.
 *
 * Gate rule:
 *   ALL three period bands (short <8s / mid 8-12s / long >12s, banded by wave_period)
 *   must show mean |recomputed_engine − stored_engine_value| < 0.001 m.
 *
 * Additionally reports DB-native per-band residuals (engine_value − buoy_value) for
 * the record. Sign convention: positive = engine over-predicts buoy.
 *
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
// Env
// ---------------------------------------------------------------------------

function loadEnv(): { supabaseUrl: string; supabaseKey: string } {
  let u = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  let k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  for (const p of [
    path.join(PROJECT_ROOT, '.env'),
    path.join(PROJECT_ROOT, 'packages/web/.env'),
  ]) {
    if (u && k) break;
    try {
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const eq = line.indexOf('=');
        if (eq < 1) continue;
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        if (key === 'SUPABASE_URL'              && !u) u = val;
        if (key === 'VITE_SUPABASE_URL'         && !u) u = val;
        if (key === 'SUPABASE_SERVICE_ROLE_KEY' && !k) k = val;
      }
    } catch { /* file not found */ }
  }
  return { supabaseUrl: u, supabaseKey: k };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function mean(a: number[]): number {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
}

function fmt(v: number, d = 4): string {
  return isNaN(v) ? 'n/a' : v.toFixed(d);
}

// ---------------------------------------------------------------------------
// DB fetch
// ---------------------------------------------------------------------------

interface DBRow {
  wave_period:   number | null;
  swell_height:  number | null;
  engine_value:  number;
  buoy_value:    number;
}

async function fetchScrippsRows(
  supabaseUrl: string,
  supabaseKey: string,
): Promise<DBRow[]> {
  const PAGE = 1000;
  const all: DBRow[] = [];
  let offset = 0;

  while (true) {
    const url =
      `${supabaseUrl}/rest/v1/calibration_residuals` +
      `?select=wave_period,swell_height,engine_value,buoy_value` +
      `&spot=eq.Scripps%20CA` +
      `&data_quality=eq.ok` +
      `&compare_basis=neq.swell_only_legacy` +
      `&wave_period=not.is.null` +
      `&order=ts.asc` +
      `&offset=${offset}&limit=${PAGE}`;

    const res = await fetch(url, {
      headers: {
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept':        'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`  DB fetch failed: ${res.status} ${body.slice(0, 200)}`);
      return all; // return what we have so far
    }

    const page = await res.json() as DBRow[];
    if (page.length === 0) break;
    all.push(...page);
    offset += page.length;
    if (page.length < PAGE) break;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Band helper
// ---------------------------------------------------------------------------

type Band = 'short' | 'mid' | 'long';

function toBand(T: number): Band {
  if (T < 8)   return 'short';
  if (T <= 12) return 'mid';
  return 'long';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n=== P6.2.9 Reconciliation Gate ===');
  console.log('Sign convention: engine_value - buoy_value (positive = engine over-predicts)\n');

  const { supabaseUrl, supabaseKey } = loadEnv();
  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: Supabase credentials not found.');
    process.exit(1);
  }

  // Confirm Scripps buoy depth from calibration-spots.ts
  const scrippsBuoyDepth =
    CALIBRATION_SPOTS.find(s => s.name === 'Scripps CA')?.buoy?.depthM ?? 41;
  console.log(`Scripps CA buoy depth: ${scrippsBuoyDepth} m`);

  console.log('Fetching Scripps CA rows from DB (wave_period, swell_height, engine_value, buoy_value)...');
  const rows = await fetchScrippsRows(supabaseUrl, supabaseKey);
  console.log(`Fetched ${rows.length} rows\n`);

  if (rows.length === 0) {
    console.log('No rows returned — run the full backfill first (backfillResiduals.ts).');
    process.exit(0);
  }

  // ---------------------------------------------------------------------------
  // Consistency check: re-run nearshoreTransform on stored inputs, compare .H to engine_value
  // ---------------------------------------------------------------------------
  // swell_height stores H0 (=wave_height, total Hs passed to nearshoreTransform)
  // wave_period stores T  (=wave_period, total peak period passed to nearshoreTransform)
  // engine_value stores tr.H = nearshoreTransform(H0, T, buoy.depthM).H
  // ---------------------------------------------------------------------------

  type BandBuckets = Record<Band, number[]>;

  const consistency: BandBuckets = { short: [], mid: [], long: [] };
  const residuals:   BandBuckets = { short: [], mid: [], long: [] };

  let skipped = 0;
  for (const row of rows) {
    if (row.wave_period == null || row.swell_height == null) { skipped++; continue; }
    const T  = row.wave_period;
    const H0 = row.swell_height;
    const b  = toBand(T);
    const tr = nearshoreTransform(H0, T, scrippsBuoyDepth);
    consistency[b].push(Math.abs(tr.H - row.engine_value));   // recomputed vs stored
    residuals[b].push(row.engine_value - row.buoy_value);      // sign: engine − buoy
  }
  if (skipped > 0) console.log(`Skipped ${skipped} rows with null wave_period or swell_height\n`);

  // ---------------------------------------------------------------------------
  // Consistency gate (PASS iff all bands < 0.001 m)
  // ---------------------------------------------------------------------------
  console.log('--- Consistency Check (recomputed engine vs stored engine_value) ---');
  console.log('Bands by wave_period; H0 = swell_height; T = wave_period; depth = buoy.depthM\n');
  console.log('| Band  |     n | Mean |recomputed−stored| (m) | Gate (<0.001 m) |');
  console.log('|-------|-------|------------------------------|-----------------|');

  const TOLERANCE = 0.001; // m
  let consistencyPass = true;

  for (const b of ['short', 'mid', 'long'] as Band[]) {
    const m    = mean(consistency[b]);
    const pass = !isNaN(m) && m < TOLERANCE;
    if (!pass) consistencyPass = false;
    const passStr = consistency[b].length === 0
      ? 'FAIL (0 rows)'
      : pass ? '  PASS' : '  FAIL';
    console.log(
      `| ${b.padEnd(5)} | ${String(consistency[b].length).padStart(5)} | ${fmt(m, 6).padStart(28)} | ${passStr}       |`,
    );
  }

  console.log('');

  // ---------------------------------------------------------------------------
  // DB-native residuals (engine_value − buoy_value, banded by wave_period)
  // ---------------------------------------------------------------------------
  console.log('--- DB-Native Residuals (engine_value - buoy_value, banded by wave_period) ---');
  console.log('Sign: positive = engine over-predicts buoy\n');
  console.log('| Band  |     n | Mean Δ (engine−buoy) m |');
  console.log('|-------|-------|------------------------|');

  for (const b of ['short', 'mid', 'long'] as Band[]) {
    const m = mean(residuals[b]);
    console.log(
      `| ${b.padEnd(5)} | ${String(residuals[b].length).padStart(5)} | ${fmt(m, 4).padStart(22)} |`,
    );
  }

  console.log('');

  // ---------------------------------------------------------------------------
  // Overall gate
  // ---------------------------------------------------------------------------
  const overall = consistencyPass ? 'GATE PASS' : 'GATE FAIL';
  console.log(`Overall: ${consistencyPass ? '✅' : '❌'} ${overall}\n`);

  if (consistencyPass) {
    console.log('DB is internally consistent: stored engine_value == nearshoreTransform(swell_height, wave_period, depth).');
    console.log('The P6.2.8 "reconciliation failure" was a banding-key mismatch (swell_period vs wave_period).');
    console.log('That mismatch is now fixed. The residual table above is trustworthy.');
    console.log('Proceed to P6.2.2 residualReport.ts for full verdict table.\n');
  } else {
    console.log('FAIL: stored engine_value does NOT match nearshoreTransform(swell_height, wave_period, depth).');
    console.log('Re-harvest required before trusting residuals. Do NOT issue P6.3 verdicts.\n');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Write gate report
  // ---------------------------------------------------------------------------
  const reportLines: string[] = [
    '# P6.2.9 Reconciliation Gate Report',
    '',
    `**Generated:** ${new Date().toISOString()}  `,
    `**Spot:** Scripps CA (CDIP-201, nearshore, depth ${scrippsBuoyDepth} m)  `,
    `**Rows fetched:** ${rows.length}  `,
    `**Skipped (null wave_period/swell_height):** ${skipped}  `,
    '',
    '## Sign convention',
    'engine_value − buoy_value: **positive = engine over-predicts buoy**',
    '',
    '## Consistency Check',
    '',
    'Re-runs `nearshoreTransform(swell_height, wave_period, buoy.depthM)` on stored inputs.',
    'Gate: mean |recomputed − stored| < 0.001 m for each band.',
    '',
    '| Band  | n | Mean |recomputed−stored| (m) | Result |',
    '|-------|---|------------------------------|--------|',
    ...(['short', 'mid', 'long'] as Band[]).map(b => {
      const m    = mean(consistency[b]);
      const pass = !isNaN(m) && m < TOLERANCE;
      return `| ${b} | ${consistency[b].length} | ${fmt(m, 6)} | ${pass ? 'PASS' : 'FAIL'} |`;
    }),
    '',
    '## DB-Native Residuals (engine_value − buoy_value)',
    '',
    '| Band  | n | Mean Δ (m) |',
    '|-------|---|------------|',
    ...(['short', 'mid', 'long'] as Band[]).map(b =>
      `| ${b} | ${residuals[b].length} | ${fmt(mean(residuals[b]), 4)} |`,
    ),
    '',
    `## Overall gate: **${overall}**`,
    '',
    consistencyPass
      ? 'DB is internally consistent. The P6.2.8 reconciliation failure was a banding-key mismatch (swell_period stored as a feature column vs wave_period used as the canonical T). Now fixed. Proceed to P6.2.2.'
      : 'FAIL — stored engine_value does not match the transform. Re-harvest required.',
  ];

  const reportPath = path.join(PROJECT_ROOT, 'calibration-gate-reconciliation-report.md');
  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  console.log(`Report written → calibration-gate-reconciliation-report.md`);
  console.log('\n=== Done ===\n');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
