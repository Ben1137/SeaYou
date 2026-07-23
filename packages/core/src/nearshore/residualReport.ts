/**
 * P6.2.2 Residual Decomposition Report — the real P6.3 gate.
 *
 * Run: npx tsx packages/core/src/nearshore/residualReport.ts
 *
 * Reads calibration_residuals (clean rows only: compare_basis != 'swell_only_legacy'),
 * decomposes per spot by swell-direction sector and period bucket, emits per-spot verdicts:
 *
 *   STRUCTURED (train-ready)        — ≥2 qualifying sectors (≥8% share AND ≥30 samples each)
 *                                      with direction-spread > 0.30 m
 *   FLAT-OFFSET (suspect)           — <2 qualifying sectors (single dominant direction) OR
 *                                      non-trivial mean with small spread — likely a
 *                                      representativeness/definition artifact, NOT learnable physics
 *   PERIOD-ARTIFACT (investigate)   — period-monotonic bias (|long-short| > 0.25 m) + weak
 *                                      direction spread — may be a GLOBAL model issue; do NOT
 *                                      learn per-spot without first checking globally
 *   NOISY (insufficient)            — n < 50 or std >> |mean| or <2 qualifying sectors with data
 *
 * Verdict precedence (lower wins):
 *   NOISY → FLAT-OFFSET → PERIOD-ARTIFACT → STRUCTURED
 *
 * Validation type:
 *   deep buoy    → INPUT (Open-Meteo ingestion) — residual = forecast error, NOT engine error
 *   nearshore    → OUTPUT (breaking model)       — residual validates the engine's nearshore transform
 *   P6.3 engine-output gate uses NEARSHORE only. Deep buoys are a separate input-correction track.
 *
 * Analysis only — no physics changes, no model training. transform.ts untouched.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

// ---------------------------------------------------------------------------
// Verdict thresholds — stated here so the report can quote them
// ---------------------------------------------------------------------------

/** Minimum share of total pool samples a sector must have to count toward spread. */
const MIN_SECTOR_SHARE = 0.08;   // 8%
/** Minimum absolute sample count a sector must have to count toward spread. */
const MIN_SECTOR_ABS   = 30;
/** Minimum number of qualifying sectors needed for a spread-based verdict. */
const MIN_QUALIFYING   = 2;
/** Spread threshold for STRUCTURED verdict (qualifying sectors only). */
const STRUCTURED_SPREAD_THRESHOLD = 0.30;
/** |mean| threshold below which FLAT-OFFSET is not triggered. */
const FLAT_OFFSET_MEAN_THRESHOLD  = 0.10;
/** Flat-offset spread ceiling. */
const FLAT_OFFSET_SPREAD_CEILING  = 0.15;
/** Period-monotonic trigger: |long_mean − short_mean| > this. */
const PERIOD_ARTIFACT_THRESHOLD   = 0.25;

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
        if (k === 'SUPABASE_URL'              && !supabaseUrl) supabaseUrl = v;
        if (k === 'VITE_SUPABASE_URL'         && !supabaseUrl) supabaseUrl = v;
        if (k === 'SUPABASE_SERVICE_ROLE_KEY' && !supabaseKey) supabaseKey = v;
      }
    } catch { /* file not found */ }
  }
  return { supabaseUrl, supabaseKey };
}

// ---------------------------------------------------------------------------
// Supabase fetch (paginated)
// ---------------------------------------------------------------------------

interface ResidualsRow {
  spot:           string;
  buoy_kind:      'deep' | 'nearshore';
  input_source:   string;
  compare_basis:  string;
  swell_dir:      number | null;
  swell_period:   number | null;
  residual:       number;
  source_buoy_id: string;
  ts:             string;
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
      `&compare_basis=neq.swell_only_legacy&data_quality=eq.ok` +
      `&order=ts.asc` +
      `&offset=${offset}&limit=${PAGE}`;

    const res = await fetch(url, {
      headers: {
        'apikey':          supabaseKey,
        'Authorization':   `Bearer ${supabaseKey}`,
        'Accept':          'application/json',
        'Range-Unit':      'items',
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
  if (p < 8)   return 'short (<8s)';
  if (p <= 12) return 'mid (8-12s)';
  return 'long (>12s)';
}

// ---------------------------------------------------------------------------
// Validation type
// ---------------------------------------------------------------------------

type ValidationType =
  | 'INPUT (Open-Meteo ingestion — NOT the engine)'
  | 'OUTPUT (breaking model — engine validation)';

function validationType(buoyKind: string): ValidationType {
  return buoyKind === 'nearshore'
    ? 'OUTPUT (breaking model — engine validation)'
    : 'INPUT (Open-Meteo ingestion — NOT the engine)';
}

// ---------------------------------------------------------------------------
// Verdict (Fix 2: new category)
// ---------------------------------------------------------------------------

type Verdict =
  | 'STRUCTURED (train-ready)'
  | 'FLAT-OFFSET (suspect)'
  | 'PERIOD-ARTIFACT (investigate globally)'
  | 'NOISY (insufficient)';

interface VerdictResult {
  verdict:               Verdict;
  /** Spread computed over qualifying sectors only. NaN if <2 qualifying. */
  sectorSpread:          number;
  /** Number of sectors that meet share+abs threshold. */
  qualifyingSectors:     number;
  /** Share of total samples in the single largest sector (0–1). */
  dominantSectorShare:   number;
  overallMean:           number;
  overallStd:            number;
  /** Whether period bias is monotonic and large enough to flag. */
  periodMonotonic:       boolean;
  /** long_mean − short_mean (NaN if either bucket empty). */
  periodDelta:           number;
}

/**
 * Fix 1: sector spread is computed ONLY over qualifying sectors (≥8% share AND ≥30 samples).
 * Fix 3: PERIOD-ARTIFACT fires when direction spread is weak AND period bias is monotonic.
 * Verdict precedence: NOISY → FLAT-OFFSET → PERIOD-ARTIFACT → STRUCTURED.
 */
function computeVerdict(
  residuals: number[],
  sectorResiduals: Map<Sector, number[]>,
  periodResiduals: Map<PeriodBucket, number[]>,
): VerdictResult {
  const n      = residuals.length;
  const oMean  = mean(residuals);
  const oStd   = std(residuals);

  // --- Dominant sector share ---
  const sectorSizes  = [...sectorResiduals.values()].map(a => a.length);
  const maxSectorN   = sectorSizes.length ? Math.max(...sectorSizes) : 0;
  const dominantShare = n > 0 ? maxSectorN / n : 0;

  // --- Qualifying sectors (Fix 1) ---
  const qualifying = [...sectorResiduals.entries()].filter(([, arr]) =>
    arr.length >= MIN_SECTOR_ABS && arr.length / n >= MIN_SECTOR_SHARE,
  );
  const qualifyingMeans = qualifying.map(([, arr]) => mean(arr));
  const qualifyingSectors = qualifying.length;

  const sectorSpread = qualifyingSectors >= 2
    ? Math.max(...qualifyingMeans) - Math.min(...qualifyingMeans)
    : NaN;

  // --- Period monotonic check (Fix 3) ---
  const pShort = periodResiduals.get('short (<8s)') ?? [];
  const pLong  = periodResiduals.get('long (>12s)') ?? [];
  const mShort = mean(pShort);
  const mLong  = mean(pLong);
  const periodDelta = (!isNaN(mShort) && !isNaN(mLong)) ? mLong - mShort : NaN;
  const periodMonotonic = !isNaN(periodDelta) && Math.abs(periodDelta) > PERIOD_ARTIFACT_THRESHOLD;

  // --- Verdict precedence: NOISY → FLAT-OFFSET → PERIOD-ARTIFACT → STRUCTURED ---

  // NOISY: too few samples overall, or std >> |mean|
  if (n < 50) {
    return { verdict: 'NOISY (insufficient)', sectorSpread: NaN, qualifyingSectors, dominantSectorShare: dominantShare, overallMean: oMean, overallStd: oStd, periodMonotonic, periodDelta };
  }
  if (!isNaN(oStd) && Math.abs(oMean) > 0 && oStd > 4 * Math.abs(oMean)) {
    return { verdict: 'NOISY (insufficient)', sectorSpread: NaN, qualifyingSectors, dominantSectorShare: dominantShare, overallMean: oMean, overallStd: oStd, periodMonotonic, periodDelta };
  }

  // FLAT-OFFSET: fewer than 2 qualifying sectors (one dominant direction) OR constant spread
  if (qualifyingSectors < MIN_QUALIFYING) {
    // Single-sector dominance — constant per-direction offset
    return { verdict: 'FLAT-OFFSET (suspect)', sectorSpread: NaN, qualifyingSectors, dominantSectorShare: dominantShare, overallMean: oMean, overallStd: oStd, periodMonotonic, periodDelta };
  }
  if (Math.abs(oMean) > FLAT_OFFSET_MEAN_THRESHOLD && sectorSpread < FLAT_OFFSET_SPREAD_CEILING) {
    return { verdict: 'FLAT-OFFSET (suspect)', sectorSpread, qualifyingSectors, dominantSectorShare: dominantShare, overallMean: oMean, overallStd: oStd, periodMonotonic, periodDelta };
  }

  // PERIOD-ARTIFACT: period-monotonic + direction spread is weak (< STRUCTURED threshold)
  if (periodMonotonic && (isNaN(sectorSpread) || sectorSpread < STRUCTURED_SPREAD_THRESHOLD)) {
    return { verdict: 'PERIOD-ARTIFACT (investigate globally)', sectorSpread, qualifyingSectors, dominantSectorShare: dominantShare, overallMean: oMean, overallStd: oStd, periodMonotonic, periodDelta };
  }

  // STRUCTURED: ≥2 qualifying sectors with real direction spread
  if (!isNaN(sectorSpread) && sectorSpread >= STRUCTURED_SPREAD_THRESHOLD) {
    return { verdict: 'STRUCTURED (train-ready)', sectorSpread, qualifyingSectors, dominantSectorShare: dominantShare, overallMean: oMean, overallStd: oStd, periodMonotonic, periodDelta };
  }

  // Fallback (spread present but below threshold, no period artifact)
  return { verdict: 'FLAT-OFFSET (suspect)', sectorSpread, qualifyingSectors, dominantSectorShare: dominantShare, overallMean: oMean, overallStd: oStd, periodMonotonic, periodDelta };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== P6.2.2 Residual Decomposition Report (corrected gate) ===\n');

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
  // Group by spot × buoy_kind × input_source × compare_basis
  // ---------------------------------------------------------------------------

  const pools = new Map<string, {
    rows:       ResidualsRow[];
    residuals:  number[];
    sectorMap:  Map<Sector, number[]>;
    periodMap:  Map<PeriodBucket, number[]>;
  }>();

  for (const row of rows) {
    const key = `${row.spot}|${row.buoy_kind}|${row.input_source}|${row.compare_basis}`;
    if (!pools.has(key)) {
      pools.set(key, { rows: [], residuals: [], sectorMap: new Map(), periodMap: new Map() });
    }
    const pool = pools.get(key)!;
    pool.rows.push(row);
    pool.residuals.push(row.residual);

    const sector = dirToSector(row.swell_dir);
    if (sector) {
      const a = pool.sectorMap.get(sector) ?? [];
      a.push(row.residual);
      pool.sectorMap.set(sector, a);
    }

    const pb = periodBucket(row.swell_period);
    if (pb) {
      const a = pool.periodMap.get(pb) ?? [];
      a.push(row.residual);
      pool.periodMap.set(pb, a);
    }
  }

  // ---------------------------------------------------------------------------
  // Coverage table
  // ---------------------------------------------------------------------------

  const covMap = new Map<string, number>();
  for (const row of rows) {
    const year = row.ts.slice(0, 4);
    const k = `${row.spot}|${row.input_source}|${row.compare_basis}|${year}`;
    covMap.set(k, (covMap.get(k) ?? 0) + 1);
  }

  // ---------------------------------------------------------------------------
  // Build summaries
  // ---------------------------------------------------------------------------

  type PoolSummary = VerdictResult & {
    spot:                string;
    buoy_kind:           string;
    source:              string;
    basis:               string;
    n:                   number;
    validationTypeLabel: ValidationType;
    sectorMap:           Map<Sector, number[]>;
    periodMap:           Map<PeriodBucket, number[]>;
    buoyId:              string;
  };

  const summaries: PoolSummary[] = [];

  for (const [key, pool] of pools.entries()) {
    const [spot, buoy_kind, source, basis] = key.split('|');
    const vr = computeVerdict(pool.residuals, pool.sectorMap, pool.periodMap);
    summaries.push({
      ...vr,
      spot, buoy_kind, source, basis,
      n:                   pool.residuals.length,
      validationTypeLabel: validationType(buoy_kind),
      sectorMap:           pool.sectorMap,
      periodMap:           pool.periodMap,
      buoyId:              pool.rows[0]?.source_buoy_id ?? 'n/a',
    });
  }

  // ---------------------------------------------------------------------------
  // Report builder
  // ---------------------------------------------------------------------------

  const reportLines: string[] = [
    `# P6.2.2 Calibration Analysis Report — Corrected P6.3 Gate`,
    ``,
    `**Generated:** ${new Date().toISOString()}  `,
    `**Total clean rows analysed:** ${rows.length}  `,
    ``,
    `## Thresholds`,
    `| Parameter | Value |`,
    `|-----------|-------|`,
    `| Min sector share for spread | ${(MIN_SECTOR_SHARE * 100).toFixed(0)}% of pool |`,
    `| Min sector absolute size    | ${MIN_SECTOR_ABS} samples |`,
    `| Min qualifying sectors      | ${MIN_QUALIFYING} |`,
    `| STRUCTURED spread threshold | > ${STRUCTURED_SPREAD_THRESHOLD} m |`,
    `| FLAT-OFFSET spread ceiling  | < ${FLAT_OFFSET_SPREAD_CEILING} m (with |mean| > ${FLAT_OFFSET_MEAN_THRESHOLD} m) |`,
    `| PERIOD-ARTIFACT trigger     | |long−short| > ${PERIOD_ARTIFACT_THRESHOLD} m AND direction spread < STRUCTURED threshold |`,
    ``,
    `**Verdict precedence:** NOISY → FLAT-OFFSET → PERIOD-ARTIFACT → STRUCTURED  `,
    `**P6.3 engine-output gate uses NEARSHORE spots only** (deep buoys measure Open-Meteo error, not engine error).  `,
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
  // Section 2 — Per-spot verdict table
  // ---------------------------------------------------------------------------

  reportLines.push(
    '', '---', '', '## 2. Per-Spot Verdict Summary', '',
    `| Spot | Validation | n | Dom. Sector % | Qual. Sectors | Spread (m) | Period Δ (m) | **Verdict** |`,
    `|------|-----------|---|--------------|---------------|-----------|--------------|-------------|`,
  );

  for (const s of summaries) {
    const valShort = s.buoy_kind === 'nearshore' ? 'OUTPUT' : 'INPUT';
    const dom = isNaN(s.dominantSectorShare) ? 'n/a' : `${(s.dominantSectorShare * 100).toFixed(0)}%`;
    const spread = isNaN(s.sectorSpread) ? 'n/a' : fmt(s.sectorSpread);
    const pDelta = isNaN(s.periodDelta) ? 'n/a' : fmt(s.periodDelta);
    reportLines.push(
      `| ${s.spot} | ${valShort} | ${s.n} | ${dom} | ${s.qualifyingSectors} | ${spread} | ${pDelta} | **${s.verdict}** |`,
    );
  }

  // ---------------------------------------------------------------------------
  // Section 3 — Per-spot sector breakdown
  // ---------------------------------------------------------------------------

  reportLines.push('', '---', '', '## 3. Swell-Direction Sector Breakdown', '');

  for (const s of summaries) {
    const valLabel = s.buoy_kind === 'nearshore'
      ? '⚡ OUTPUT — validates breaking model'
      : '📡 INPUT — validates Open-Meteo ingestion (not the engine)';
    reportLines.push(`### ${s.spot} (${s.buoy_kind}, ${s.source})`);
    reportLines.push(`${valLabel}  `);
    reportLines.push(`Buoy: ${s.buoyId} · n=${s.n} · mean Δ=${fmt(s.overallMean)}m · σ=${fmt(s.overallStd)}m  `);
    reportLines.push(`Dom. sector share: ${(s.dominantSectorShare * 100).toFixed(0)}% · Qualifying sectors: ${s.qualifyingSectors}/${SECTORS.length} · Spread (qual. only): ${isNaN(s.sectorSpread) ? 'n/a' : fmt(s.sectorSpread) + 'm'}  `);
    reportLines.push(`Verdict: **${s.verdict}**  `);
    reportLines.push('');
    reportLines.push('| Sector | n | Share % | Mean Δ (m) | Median Δ (m) | StdDev | Qualifies? |');
    reportLines.push('|--------|---|---------|-----------|-------------|--------|------------|');

    for (const sector of SECTORS) {
      const arr = s.sectorMap.get(sector) ?? [];
      const share = s.n > 0 ? arr.length / s.n : 0;
      const qualifies = arr.length >= MIN_SECTOR_ABS && share >= MIN_SECTOR_SHARE ? '✓' : '✗ (minor)';
      if (arr.length === 0) {
        reportLines.push(`| ${sector} | 0 | 0% | n/a | n/a | n/a | ✗ (empty) |`);
      } else {
        reportLines.push(
          `| ${sector} | ${arr.length} | ${(share * 100).toFixed(0)}% | ${fmt(mean(arr))} | ${fmt(median(arr))} | ${fmt(std(arr))} | ${qualifies} |`,
        );
      }
    }

    reportLines.push('');
    reportLines.push('**Period bucket breakdown:**');
    reportLines.push('');
    reportLines.push('| Period | n | Mean Δ (m) | StdDev |');
    reportLines.push('|--------|---|-----------|--------|');
    for (const pb of ['short (<8s)', 'mid (8-12s)', 'long (>12s)'] as PeriodBucket[]) {
      const arr = s.periodMap.get(pb) ?? [];
      reportLines.push(`| ${pb} | ${arr.length} | ${fmt(arr.length ? mean(arr) : NaN)} | ${fmt(arr.length > 1 ? std(arr) : NaN)} |`);
    }
    if (s.periodMonotonic) {
      reportLines.push(`> ⚠️ Period-monotonic bias flagged: |long−short| = ${fmt(Math.abs(s.periodDelta))}m > ${PERIOD_ARTIFACT_THRESHOLD}m threshold.`);
    }
    reportLines.push('');
  }

  // ---------------------------------------------------------------------------
  // Section 3.5 — Named suspects
  // ---------------------------------------------------------------------------

  reportLines.push('---', '', '## 3.5 Named Suspects', '');

  const rincon   = summaries.find(s => s.spot === 'Rincon CA'    && s.source === 'reanalysis');
  const mavericks = summaries.find(s => s.spot === 'Mavericks CA' && s.source === 'reanalysis');
  const santaCruz = summaries.find(s => s.spot === 'Santa Cruz CA');
  const scripps   = summaries.find(s => s.spot === 'Scripps CA');

  if (rincon) {
    reportLines.push(`### Rincon CA (${rincon.buoyId}) — INPUT pool`);
    reportLines.push(`Mean Δ = ${fmt(rincon.overallMean)}m · dominant sector share = ${(rincon.dominantSectorShare * 100).toFixed(0)}% · qualifying sectors = ${rincon.qualifyingSectors} · verdict = **${rincon.verdict}**`);
    reportLines.push('');
    reportLines.push('**Channel Islands shadow hypothesis:** NDBC 46054 (~80 km offshore, 464 m depth) is exposed to open-ocean W/SW swells that the Channel Islands block before they reach Rincon Point. If the dominant-sector analysis confirms W swell owns >80% of samples, this is a representativeness mismatch — the buoy is sampling energy that the engine correctly treats as blocked.');
    reportLines.push('');
    if (rincon.verdict === 'FLAT-OFFSET (suspect)') {
      reportLines.push(`**Finding: FLAT-OFFSET confirmed** (single-sector dominance or constant spread). Rincon's ${fmt(rincon.overallMean)}m bias is NOT learnable direction-structured error — it is the offshore/inshore representativeness mismatch. **Do NOT use for P6.3.** Investigate by comparing NDBC 46054 vs an inshore CDIP station closer to the point.`);
    } else {
      reportLines.push(`**Finding: ${rincon.verdict}** (qualifying sectors = ${rincon.qualifyingSectors}, spread = ${isNaN(rincon.sectorSpread) ? 'n/a' : fmt(rincon.sectorSpread) + 'm'}). The direction structure may be real — but as a deep INPUT spot, this still does NOT validate the engine's breaking model. Route to the input-correction track, not P6.3 engine output.`);
    }
    reportLines.push('');
  }

  if (mavericks) {
    reportLines.push(`### Mavericks CA (${mavericks.buoyId}) — INPUT pool`);
    reportLines.push(`Mean Δ = ${fmt(mavericks.overallMean)}m · qualifying sectors = ${mavericks.qualifyingSectors} · spread = ${isNaN(mavericks.sectorSpread) ? 'n/a' : fmt(mavericks.sectorSpread) + 'm'} · verdict = **${mavericks.verdict}**`);
    reportLines.push('');
    if (mavericks.verdict === 'STRUCTURED (train-ready)') {
      reportLines.push('**Finding:** Direction-varying structure is real over the full 2-year window. However, as a DEEP buoy, this is Open-Meteo forecast accuracy at NDBC 46012, not engine breaking-model error. Route to input-correction track; do not train as engine-output correction.');
    } else if (mavericks.verdict === 'FLAT-OFFSET (suspect)') {
      reportLines.push(`**Finding: FLAT-OFFSET** — the bias (${fmt(mavericks.overallMean)}m) is constant across qualifying sectors. Consistent with a systematic CMEMS reanalysis underestimate at this location, not directional engine error. Investigate input source before any correction.`);
    } else if (mavericks.verdict === 'PERIOD-ARTIFACT (investigate globally)') {
      reportLines.push(`**Finding: PERIOD-ARTIFACT** — period-monotonic bias (Δ=${fmt(mavericks.periodDelta)}m) with weak direction spread. Likely a global Open-Meteo period/energy handling issue. Investigate globally (does this period trend appear at all deep spots?) before treating as per-location.`);
    }
    reportLines.push('');
  }

  if (santaCruz) {
    reportLines.push(`### Santa Cruz CA (${santaCruz.buoyId}) — OUTPUT pool ⚡`);
    reportLines.push(`Mean Δ = ${fmt(santaCruz.overallMean)}m · qualifying sectors = ${santaCruz.qualifyingSectors} · spread = ${isNaN(santaCruz.sectorSpread) ? 'n/a' : fmt(santaCruz.sectorSpread) + 'm'} · period Δ = ${fmt(santaCruz.periodDelta)}m · verdict = **${santaCruz.verdict}**`);
    reportLines.push('');
    if (santaCruz.verdict === 'PERIOD-ARTIFACT (investigate globally)') {
      reportLines.push(`**Finding: PERIOD-ARTIFACT** — period-monotonic bias (short→mid→long trend = ${fmt(santaCruz.periodDelta)}m) with weak direction spread. The consistent negative bias (engine over-predicts nearshore height) growing with period may reflect the engine's long-period shoaling response, a global Open-Meteo period handling caveat, or both. **Investigate whether this trend is consistent across Scripps** (same CDIP network, nearby). If both nearshore spots show the same period trend, this is a global issue to fix in the physics or the input — not a per-location ML term.`);
    } else if (santaCruz.verdict === 'STRUCTURED (train-ready)') {
      reportLines.push(`**Finding: STRUCTURED** — direction structure survives the weighted-spread filter. Primary nearshore OUTPUT candidate for P6.3. Cross-check with Scripps.`);
    }
    reportLines.push('');
  }

  if (scripps) {
    reportLines.push(`### Scripps CA (${scripps.buoyId}) — OUTPUT pool ⚡`);
    reportLines.push(`Mean Δ = ${fmt(scripps.overallMean)}m · qualifying sectors = ${scripps.qualifyingSectors} · spread = ${isNaN(scripps.sectorSpread) ? 'n/a' : fmt(scripps.sectorSpread) + 'm'} · period Δ = ${fmt(scripps.periodDelta)}m · verdict = **${scripps.verdict}**`);
    reportLines.push('');
    if (scripps.verdict === 'PERIOD-ARTIFACT (investigate globally)') {
      reportLines.push(`**Finding: PERIOD-ARTIFACT** — period-monotonic bias (${fmt(scripps.periodDelta)}m). Both Scripps and Santa Cruz flagging period-monotonic negative bias is strong evidence of a global issue (not per-location). Recommended action: plot the two period-bucket curves together; if they track in parallel, fix the root cause globally rather than learning per-spot corrections.`);
    } else if (scripps.verdict === 'STRUCTURED (train-ready)') {
      reportLines.push(`**Finding: STRUCTURED** — direction structure present. Nearshore OUTPUT candidate.`);
    }
    reportLines.push('');
  }

  // ---------------------------------------------------------------------------
  // Section 4 — P6.3 gate (split by validation type)
  // ---------------------------------------------------------------------------

  reportLines.push('---', '', '## 4. P6.3 Gate', '');

  const nearshoreStructured  = summaries.filter(s => s.buoy_kind === 'nearshore' && s.verdict === 'STRUCTURED (train-ready)');
  const nearshorePeriod      = summaries.filter(s => s.buoy_kind === 'nearshore' && s.verdict === 'PERIOD-ARTIFACT (investigate globally)');
  const nearshoreFlat        = summaries.filter(s => s.buoy_kind === 'nearshore' && s.verdict === 'FLAT-OFFSET (suspect)');
  const nearshoreNoisy       = summaries.filter(s => s.buoy_kind === 'nearshore' && s.verdict === 'NOISY (insufficient)');
  const deepStructured       = summaries.filter(s => s.buoy_kind === 'deep' && s.verdict === 'STRUCTURED (train-ready)');
  const deepOther            = summaries.filter(s => s.buoy_kind === 'deep' && s.verdict !== 'STRUCTURED (train-ready)');

  reportLines.push('### Engine-Output Candidates (nearshore buoys only)', '');
  reportLines.push('> Only these spots validate the SeaYou breaking model. Deep buoys are a separate track.', '');

  reportLines.push('**✅ Train-ready (STRUCTURED, nearshore):**');
  if (nearshoreStructured.length === 0) {
    reportLines.push('- _None — check if period-artifact spots can be fixed globally first._');
  } else {
    for (const s of nearshoreStructured) {
      reportLines.push(`- **${s.spot}** — n=${s.n}, mean Δ=${fmt(s.overallMean)}m, spread=${fmt(s.sectorSpread)}m`);
    }
  }

  reportLines.push('');
  reportLines.push('**⚠️ Period-artifact (investigate globally first):**');
  if (nearshorePeriod.length === 0) {
    reportLines.push('- _None._');
  } else {
    for (const s of nearshorePeriod) {
      reportLines.push(`- **${s.spot}** — period Δ=${fmt(s.periodDelta)}m (${fmt(s.overallMean)}m mean). If this is a global period-handling issue, fix the cause first; do NOT learn a per-spot correction for a global bias.`);
    }
  }

  reportLines.push('');
  reportLines.push('**🚫 Suspect / insufficient (nearshore):**');
  if (nearshoreFlat.length + nearshoreNoisy.length === 0) {
    reportLines.push('- _None._');
  } else {
    for (const s of [...nearshoreFlat, ...nearshoreNoisy]) {
      reportLines.push(`- ${s.spot} — ${s.verdict}`);
    }
  }

  reportLines.push('', '### Open-Meteo Input Observations (deep buoys — separate track)', '');
  reportLines.push('> These spots do NOT validate the engine. A correction here patches the forecast provider.');
  reportLines.push('');
  if (deepStructured.length > 0) {
    reportLines.push('**STRUCTURED deep spots (input-correction candidates, not P6.3 engine correction):**');
    for (const s of deepStructured) {
      reportLines.push(`- ${s.spot} — n=${s.n}, mean Δ=${fmt(s.overallMean)}m, spread=${fmt(s.sectorSpread)}m`);
    }
    reportLines.push('');
  }
  if (deepOther.length > 0) {
    reportLines.push('**Other deep spots:**');
    for (const s of deepOther) {
      reportLines.push(`- ${s.spot} — ${s.verdict} (mean Δ=${fmt(s.overallMean)}m)`);
    }
    reportLines.push('');
  }

  reportLines.push(
    '> **Rule:** P6.3 trains ONLY on nearshore STRUCTURED spots.',
    '> PERIOD-ARTIFACT spots: investigate whether the period trend is global across all nearshore spots; if so, fix the root cause (physics or input) rather than learning per-spot.',
    '> FLAT-OFFSET: fix the data/comparison definition first.',
    '> Deep spots: route to input-correction investigation, not engine-output P6.3.',
    '',
    '_Generated by P6.2.2 residualReport.ts — analysis only; no physics changes; no model training._',
  );

  // ---------------------------------------------------------------------------
  // Write report
  // ---------------------------------------------------------------------------

  const reportPath = path.join(PROJECT_ROOT, 'calibration-analysis-report.md');
  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  console.log(`Report written → calibration-analysis-report.md (${reportLines.length} lines)`);

  // Console summary
  console.log('\n--- Per-Spot Verdict (P6.2.2 corrected) ---');
  for (const s of summaries) {
    const valShort = s.buoy_kind === 'nearshore' ? 'OUTPUT' : 'INPUT ';
    const dom = `dom=${(s.dominantSectorShare * 100).toFixed(0)}%`;
    const qual = `qual=${s.qualifyingSectors}`;
    const spread = isNaN(s.sectorSpread) ? 'spread=n/a' : `spread=${fmt(s.sectorSpread)}m`;
    console.log(`  [${valShort}] ${s.spot.padEnd(18)}  n=${String(s.n).padStart(5)}  mean=${fmt(s.overallMean)}m  ${dom}  ${qual}  ${spread}  → ${s.verdict}`);
  }

  console.log('\n=== Done ===\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
