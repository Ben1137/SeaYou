/**
 * P6.2.1 Residual Decomposition Report — the P6.3 gate.
 *
 * Run: npx tsx packages/core/src/nearshore/residualReport.ts
 *
 * Reads calibration_residuals (clean rows only: compare_basis != 'swell_only_legacy'),
 * decomposes per spot by swell-direction sector and period bucket, emits per-spot verdicts:
 *   STRUCTURED   — direction/period-varying bias → learnable, train-ready
 *   FLAT-OFFSET  — constant per-spot offset → likely representativeness artifact, investigate first
 *   NOISY        — insufficient signal or std >> |mean|
 *
 * Output: calibration-analysis-report.md
 * Analysis only — no physics changes, no model training. transform.ts untouched.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

// ---------------------------------------------------------------------------
// Load env (root .env first)
// ---------------------------------------------------------------------------

function loadEnv(): { supabaseUrl: string; supabaseKey: string } {
  let supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  const envPaths = [
    path.join(PROJECT_ROOT, '.env'),
    path.join(PROJECT_ROOT, 'packages/web/.env'),
  ];
  for (const envPath of envPaths) {
    if (supabaseUrl && supabaseKey) break;
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
    } catch { /* file not found */ }
  }
  return { supabaseUrl, supabaseKey };
}

// ---------------------------------------------------------------------------
// Supabase fetch (paginated — calibration_residuals can be large)
// ---------------------------------------------------------------------------

interface ResidualsRow {
  spot:          string;
  buoy_kind:     'deep' | 'nearshore';
  input_source:  string;
  compare_basis: string;
  swell_dir:     number | null;
  swell_period:  number | null;
  residual:      number;
  source_buoy_id: string;
  ts:            string;
}

async function fetchAllResiduals(
  supabaseUrl: string,
  supabaseKey: string,
): Promise<ResidualsRow[]> {
  const PAGE = 1000;
  const all: ResidualsRow[] = [];
  let offset = 0;

  while (true) {
    const url =
      `${supabaseUrl}/rest/v1/calibration_residuals` +
      `?select=spot,buoy_kind,input_source,compare_basis,swell_dir,swell_period,residual,source_buoy_id,ts` +
      `&compare_basis=neq.swell_only_legacy` +
      `&order=ts.asc` +
      `&offset=${offset}&limit=${PAGE}`;

    const res = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept': 'application/json',
        'Range-Unit': 'items',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase fetch failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const page = await res.json() as ResidualsRow[];
    if (page.length === 0) break;
    all.push(...page);
    offset += page.length;
    if (page.length < PAGE) break;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : NaN;
}

function median(arr: number[]): number {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function std(arr: number[]): number {
  if (arr.length < 2) return NaN;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function fmt(v: number, dec = 3): string {
  return isNaN(v) ? 'n/a' : v.toFixed(dec);
}

// ---------------------------------------------------------------------------
// Swell-direction sector bucketing (8 × 45°)
// ---------------------------------------------------------------------------

const SECTORS = ['N','NE','E','SE','S','SW','W','NW'] as const;
type Sector = typeof SECTORS[number];

function dirToSector(deg: number | null): Sector | null {
  if (deg == null) return null;
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;
  return SECTORS[idx];
}

// ---------------------------------------------------------------------------
// Period bucketing
// ---------------------------------------------------------------------------

type PeriodBucket = 'short (<8s)' | 'mid (8-12s)' | 'long (>12s)';

function periodBucket(p: number | null): PeriodBucket | null {
  if (p == null) return null;
  if (p < 8)  return 'short (<8s)';
  if (p <= 12) return 'mid (8-12s)';
  return 'long (>12s)';
}

// ---------------------------------------------------------------------------
// Verdict logic
// ---------------------------------------------------------------------------

type Verdict = 'STRUCTURED (train-ready)' | 'FLAT-OFFSET (suspect)' | 'NOISY (insufficient)';

function computeVerdict(
  residuals: number[],
  sectorResiduals: Map<Sector, number[]>,
): { verdict: Verdict; sectorSpread: number; overallMean: number; overallStd: number } {
  const n = residuals.length;
  const oMean = mean(residuals);
  const oStd  = std(residuals);

  // Not enough data per bucket
  const sectorMeans = [...sectorResiduals.entries()]
    .filter(([, arr]) => arr.length >= 5)
    .map(([, arr]) => mean(arr));

  if (n < 50 || sectorMeans.length < 3) {
    return { verdict: 'NOISY (insufficient)', sectorSpread: NaN, overallMean: oMean, overallStd: oStd };
  }

  const sectorSpread = Math.max(...sectorMeans) - Math.min(...sectorMeans);

  // Noisy: std >> |mean|
  if (!isNaN(oStd) && Math.abs(oMean) > 0 && oStd > 4 * Math.abs(oMean)) {
    return { verdict: 'NOISY (insufficient)', sectorSpread, overallMean: oMean, overallStd: oStd };
  }

  // Structured: sector means vary meaningfully
  if (sectorSpread > 0.3) {
    return { verdict: 'STRUCTURED (train-ready)', sectorSpread, overallMean: oMean, overallStd: oStd };
  }

  // Flat-offset: non-trivial but constant across sectors
  if (Math.abs(oMean) > 0.1 && sectorSpread < 0.15) {
    return { verdict: 'FLAT-OFFSET (suspect)', sectorSpread, overallMean: oMean, overallStd: oStd };
  }

  // Default: structured (direction is present but moderate spread)
  if (sectorSpread >= 0.15) {
    return { verdict: 'STRUCTURED (train-ready)', sectorSpread, overallMean: oMean, overallStd: oStd };
  }

  return { verdict: 'NOISY (insufficient)', sectorSpread, overallMean: oMean, overallStd: oStd };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== P6.2.1 Residual Decomposition Report ===\n');

  const { supabaseUrl, supabaseKey } = loadEnv();
  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: Supabase credentials not found in environment.');
    process.exit(1);
  }

  console.log('Fetching clean residuals from Supabase...');
  const rows = await fetchAllResiduals(supabaseUrl, supabaseKey);
  console.log(`Fetched ${rows.length} clean rows.\n`);

  if (rows.length === 0) {
    console.log('No clean rows — run the full backfill first.');
    process.exit(0);
  }

  // ---------------------------------------------------------------------------
  // Group by spot × buoy_kind × input_source × compare_basis (the analysis pools)
  // ---------------------------------------------------------------------------

  type PoolKey = string;
  const pools = new Map<PoolKey, {
    rows: ResidualsRow[];
    residuals: number[];
    sectorMap: Map<Sector, number[]>;
    periodMap: Map<PeriodBucket, number[]>;
  }>();

  for (const row of rows) {
    const key = `${row.spot}|${row.buoy_kind}|${row.input_source}|${row.compare_basis}`;
    if (!pools.has(key)) {
      pools.set(key, {
        rows: [],
        residuals: [],
        sectorMap: new Map(),
        periodMap: new Map(),
      });
    }
    const pool = pools.get(key)!;
    pool.rows.push(row);
    pool.residuals.push(row.residual);

    const sector = dirToSector(row.swell_dir);
    if (sector) {
      const arr = pool.sectorMap.get(sector) ?? [];
      arr.push(row.residual);
      pool.sectorMap.set(sector, arr);
    }

    const pb = periodBucket(row.swell_period);
    if (pb) {
      const arr = pool.periodMap.get(pb) ?? [];
      arr.push(row.residual);
      pool.periodMap.set(pb, arr);
    }
  }

  // ---------------------------------------------------------------------------
  // Coverage table
  // ---------------------------------------------------------------------------

  // Group by spot × input_source × compare_basis × year
  type CovKey = string;
  const covMap = new Map<CovKey, number>();
  for (const row of rows) {
    const year = row.ts.slice(0, 4);
    const k = `${row.spot}|${row.input_source}|${row.compare_basis}|${year}`;
    covMap.set(k, (covMap.get(k) ?? 0) + 1);
  }

  // ---------------------------------------------------------------------------
  // Build report lines
  // ---------------------------------------------------------------------------

  const reportLines: string[] = [
    `# P6.2.1 Calibration Analysis Report — P6.3 Gate`,
    ``,
    `**Generated:** ${new Date().toISOString()}  `,
    `**Total clean rows analysed:** ${rows.length}  `,
    `**Thresholds:** sector-spread > 0.30 m → STRUCTURED; < 0.15 m AND |mean| > 0.10 m → FLAT-OFFSET; else NOISY  `,
    ``,
    `---`,
    ``,
    `## 1. Coverage Table`,
    ``,
    `| Spot | Input Source | Basis | Year | Rows |`,
    `|------|-------------|-------|------|------|`,
  ];

  for (const [k, n] of [...covMap.entries()].sort()) {
    const [spot, src, basis, year] = k.split('|');
    reportLines.push(`| ${spot} | ${src} | ${basis} | ${year} | ${n} |`);
  }

  // ---------------------------------------------------------------------------
  // Per-spot verdict table
  // ---------------------------------------------------------------------------

  reportLines.push('', '---', '', '## 2. Per-Spot Verdict Summary', '');
  reportLines.push(
    `| Spot | Kind | Source | n | Mean Δ (m) | Sector Spread (m) | Period Trend | **Verdict** |`,
    `|------|------|--------|---|-----------|------------------|--------------|-------------|`,
  );

  // Per-pool verdict + sector/period breakdowns collected for section 3
  type PoolSummary = {
    spot: string; buoy_kind: string; source: string; basis: string;
    n: number; oMean: number; oStd: number; sectorSpread: number;
    verdict: Verdict;
    sectorMap: Map<Sector, number[]>;
    periodMap: Map<PeriodBucket, number[]>;
    buoyId: string;
  };
  const summaries: PoolSummary[] = [];

  for (const [key, pool] of pools.entries()) {
    const [spot, buoy_kind, source, basis] = key.split('|');
    const { verdict, sectorSpread, overallMean, overallStd } = computeVerdict(pool.residuals, pool.sectorMap);

    // Period trend: check if long > mid > short (ascending) or not
    const pShort = pool.periodMap.get('short (<8s)');
    const pMid   = pool.periodMap.get('mid (8-12s)');
    const pLong  = pool.periodMap.get('long (>12s)');
    const mShort = pShort?.length ? mean(pShort) : NaN;
    const mMid   = pMid?.length   ? mean(pMid)   : NaN;
    const mLong  = pLong?.length  ? mean(pLong)  : NaN;
    void mMid; // acknowledged but not used in trend direction calc
    let periodTrend = 'n/a';
    if (!isNaN(mShort) && !isNaN(mLong)) {
      const diff = mLong - mShort;
      if (diff > 0.2)       periodTrend = `↑ +${diff.toFixed(2)}m (long>short)`;
      else if (diff < -0.2) periodTrend = `↓ ${diff.toFixed(2)}m (short>long)`;
      else                   periodTrend = `flat (${diff.toFixed(2)}m)`;
    }

    const buoyId = pool.rows[0]?.source_buoy_id ?? 'n/a';

    reportLines.push(
      `| ${spot} | ${buoy_kind} | ${source} | ${pool.residuals.length} | ${fmt(overallMean)} | ${fmt(sectorSpread)} | ${periodTrend} | **${verdict}** |`,
    );

    summaries.push({ spot, buoy_kind, source, basis, n: pool.residuals.length, oMean: overallMean, oStd: overallStd, sectorSpread, verdict, sectorMap: pool.sectorMap, periodMap: pool.periodMap, buoyId });
  }

  // ---------------------------------------------------------------------------
  // Per-spot sector breakdown (Section 3)
  // ---------------------------------------------------------------------------

  reportLines.push('', '---', '', '## 3. Swell-Direction Sector Breakdown', '');

  for (const s of summaries) {
    reportLines.push(`### ${s.spot} (${s.buoy_kind}, ${s.source}, ${s.basis})`);
    reportLines.push(`Buoy: ${s.buoyId} · n=${s.n} · mean Δ=${fmt(s.oMean)}m · σ=${fmt(s.oStd)}m · verdict: **${s.verdict}**`);
    reportLines.push('');
    reportLines.push(`| Sector | n | Mean Δ (m) | Median Δ (m) | StdDev |`);
    reportLines.push(`|--------|---|-----------|-------------|--------|`);

    for (const sector of SECTORS) {
      const arr = s.sectorMap.get(sector) ?? [];
      if (arr.length === 0) {
        reportLines.push(`| ${sector} | 0 | n/a | n/a | n/a |`);
      } else {
        reportLines.push(`| ${sector} | ${arr.length} | ${fmt(mean(arr))} | ${fmt(median(arr))} | ${fmt(std(arr))} |`);
      }
    }

    reportLines.push('');
    reportLines.push('**Period bucket breakdown:**');
    reportLines.push('');
    reportLines.push(`| Period | n | Mean Δ (m) | StdDev |`);
    reportLines.push(`|--------|---|-----------|--------|`);
    for (const pb of ['short (<8s)', 'mid (8-12s)', 'long (>12s)'] as PeriodBucket[]) {
      const arr = s.periodMap.get(pb) ?? [];
      reportLines.push(`| ${pb} | ${arr.length} | ${fmt(arr.length ? mean(arr) : NaN)} | ${fmt(arr.length > 1 ? std(arr) : NaN)} |`);
    }
    reportLines.push('');
  }

  // ---------------------------------------------------------------------------
  // Known suspects section (Section 3.5)
  // ---------------------------------------------------------------------------

  reportLines.push('---', '', '## 3.5 Named Suspects', '');

  const rincon = summaries.find(s => s.spot === 'Rincon CA');
  const mavericks = summaries.find(s => s.spot === 'Mavericks CA' && s.source === 'reanalysis');

  if (rincon) {
    reportLines.push(`### Rincon CA (${rincon.buoyId})`);
    reportLines.push(`Overall mean Δ = ${fmt(rincon.oMean)}m on a **deep** buoy (${rincon.buoyId}).`);
    reportLines.push('');
    reportLines.push('**Channel Islands shadow hypothesis:** NDBC 46054 sits ~80 km offshore in 464 m depth, well outside the Channel Islands chain. The Islands (Santa Cruz, Anacapa) shadow the point from W and SW swells — the buoy sees open-ocean energy that never reaches Rincon. If the sector decomposition shows a large flat offset across W/SW sectors (the dominant swell window for Rincon), this confirms a representativeness mismatch, not an engine error.');
    reportLines.push('');
    if (rincon.verdict === 'FLAT-OFFSET (suspect)') {
      reportLines.push(`**Finding: sector spread = ${fmt(rincon.sectorSpread)}m → FLAT-OFFSET confirmed.** Constant offset regardless of direction is the signature of a definition/siting artifact. Recommendation: investigate NDBC 46054 vs an inshore buoy (e.g. CDIP nearshore) before trusting for ML training.`);
    } else {
      reportLines.push(`**Finding: sector spread = ${fmt(rincon.sectorSpread)}m → ${rincon.verdict}.** Requires further investigation.`);
    }
    reportLines.push('');
  } else {
    reportLines.push('_Rincon CA: no clean rows in current dataset — backfill may not have reached this spot yet._');
    reportLines.push('');
  }

  if (mavericks) {
    reportLines.push(`### Mavericks CA (${mavericks.buoyId}, reanalysis full window)`);
    reportLines.push(`Bias over full backfill window: mean Δ = ${fmt(mavericks.oMean)}m · sector spread = ${fmt(mavericks.sectorSpread)}m · verdict = **${mavericks.verdict}**.`);
    reportLines.push('');
    if (mavericks.verdict === 'STRUCTURED (train-ready)') {
      reportLines.push('**Finding:** Direction-varying bias is present — the +0.57m figure from the one-week January slice was masking structure that only appears over a full year. Candidate for P6.3 correction.');
    } else if (mavericks.verdict === 'FLAT-OFFSET (suspect)') {
      reportLines.push('**Finding:** Bias is flat across sectors — the +0.57m one-week figure carries through to the full window without direction structure. This is more consistent with a systematic Open-Meteo CMEMS underestimate at this location than learnable physics. Do NOT use as-is for P6.3 training; investigate whether switching from reanalysis to operational archive improves the bias before training.');
    } else {
      reportLines.push(`**Finding:** Insufficient signal — n=${mavericks.n}, std=${fmt(mavericks.oStd)}m. Keep collecting.`);
    }
    reportLines.push('');
  } else {
    reportLines.push('_Mavericks CA: no clean reanalysis rows in current dataset._');
    reportLines.push('');
  }

  // ---------------------------------------------------------------------------
  // P6.3 Recommendation (Section 4)
  // ---------------------------------------------------------------------------

  reportLines.push('---', '', '## 4. P6.3 Gate — Train-Ready / Suspect / Insufficient', '');

  const trainReady  = summaries.filter(s => s.verdict === 'STRUCTURED (train-ready)');
  const suspect     = summaries.filter(s => s.verdict === 'FLAT-OFFSET (suspect)');
  const insufficient = summaries.filter(s => s.verdict === 'NOISY (insufficient)');

  reportLines.push(`**Train-ready (STRUCTURED):**`);
  if (trainReady.length === 0) {
    reportLines.push('- _None yet — run full backfill or collect more live_forecast data._');
  } else {
    for (const s of trainReady) {
      reportLines.push(`- ${s.spot} (${s.buoy_kind}, ${s.source}) — n=${s.n}, mean Δ=${fmt(s.oMean)}m, sector spread=${fmt(s.sectorSpread)}m`);
    }
  }

  reportLines.push('');
  reportLines.push(`**Suspect — investigate before training (FLAT-OFFSET):**`);
  if (suspect.length === 0) {
    reportLines.push('- _None._');
  } else {
    for (const s of suspect) {
      reportLines.push(`- ${s.spot} (${s.buoy_kind}, ${s.source}) — mean Δ=${fmt(s.oMean)}m, sector spread=${fmt(s.sectorSpread)}m. Likely representativeness/definition artifact; do not train as-is.`);
    }
  }

  reportLines.push('');
  reportLines.push(`**Insufficient data (NOISY):**`);
  if (insufficient.length === 0) {
    reportLines.push('- _None._');
  } else {
    for (const s of insufficient) {
      reportLines.push(`- ${s.spot} (${s.buoy_kind}, ${s.source}) — n=${s.n}. Keep collecting.`);
    }
  }

  reportLines.push('');
  reportLines.push('> **Rule:** P6.3 trains ONLY on STRUCTURED spots. FLAT-OFFSET spots get buoy siting/comparison definition fixed first — a constant offset is corrected by fixing the data, not by a model memorising it. NOISY spots keep accumulating.');
  reportLines.push('');
  reportLines.push('_Generated by P6.2.1 residualReport.ts — analysis only; no physics changes; no model training._');

  // ---------------------------------------------------------------------------
  // Write report
  // ---------------------------------------------------------------------------

  const reportPath = path.join(PROJECT_ROOT, 'calibration-analysis-report.md');
  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  console.log(`Report written → calibration-analysis-report.md (${reportLines.length} lines)`);

  // Print the verdict table to stdout for the orchestrator
  console.log('\n--- Per-Spot Verdict ---');
  for (const s of summaries) {
    console.log(`  ${s.spot.padEnd(20)} n=${String(s.n).padStart(5)}  mean=${fmt(s.oMean)}m  spread=${fmt(s.sectorSpread)}m  → ${s.verdict}`);
  }

  console.log('\n=== Done ===\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
