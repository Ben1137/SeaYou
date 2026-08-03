/**
 * Wave consistency metrics — two candidates behind a build-time switch.
 *
 * CONSISTENCY_METRIC = 'TEMPORAL' (default, shipped)
 *   Coefficient of variation of breaking-wave height over N forecast hours.
 *   "Are the sets holding?" — partition-problem-free, surfer-relevant.
 *
 * CONSISTENCY_METRIC = 'CLEANLINESS' (alternative, not shipped by default)
 *   Swell dominance ratio via chopIndex from utils/scoring.ts.
 *   MANDATORY: if enabled, it MUST call chopIndex() — do not reimplement
 *   the swell/chop ratio here. Two functions computing the same quantity will
 *   drift, and that drift is how a field named swell_wave_peak_period ended up
 *   holding a mean across six calibration rounds.
 *
 * MODAL PARTITION CAVEAT (measured P6.2.15, 2026-07-25):
 *   Open-Meteo's swell_wave_height and wind_wave_height are modal estimates,
 *   NOT an energy-conserving decomposition. sqrt(swell²+wind²) misses the
 *   provider's own wave_height total by 0.06–0.25 m mean and up to 1.56 m at
 *   individual timesteps. CLEANLINESS inherits this error in every ratio it
 *   computes.  TEMPORAL is immune.
 */

import { chopIndex } from '../utils/scoring';

export const CONSISTENCY_METRIC: 'TEMPORAL' | 'CLEANLINESS' = 'TEMPORAL';

// Number of forecast hours to average over for temporal steadiness.
export const STEADINESS_WINDOW_H = 6;

// ─── Shared types ────────────────────────────────────────────────────────────

export type ConsistencyLabel = 'Steady' | 'Variable' | 'Dropping' | 'Clean' | 'Mixed' | 'Messy';

export interface ConsistencyResult {
  /** Label for display (word + bar). */
  label: ConsistencyLabel;
  /** Raw metric value [0,1]. CoV for TEMPORAL; dominance ratio for CLEANLINESS. */
  value: number;
  /** Which metric was computed. */
  metric: 'TEMPORAL' | 'CLEANLINESS';
}

// ─── Candidate B — Temporal steadiness ───────────────────────────────────────

/**
 * Coefficient of variation of breaking-wave height over a forecast window.
 *
 * CoV = stddev(Hb) / mean(Hb)
 *   0.0 → perfectly steady (every hour identical)
 *   0.3 → variable
 *   >0.5 → dropping sharply or highly erratic
 *
 * @param breakingHeights  Array of breaking-wave heights (m) for consecutive
 *                         forecast hours. Must have ≥ 2 elements; single-element
 *                         arrays are treated as perfectly steady (CoV = 0).
 */
export function temporalSteadiness(breakingHeights: number[]): ConsistencyResult {
  const n = breakingHeights.length;

  if (n === 0) {
    return { label: 'Variable', value: 0, metric: 'TEMPORAL' };
  }
  if (n === 1) {
    return { label: 'Steady', value: 0, metric: 'TEMPORAL' };
  }

  const mean = breakingHeights.reduce((s, h) => s + h, 0) / n;

  if (mean <= 0) {
    return { label: 'Variable', value: 0, metric: 'TEMPORAL' };
  }

  const variance = breakingHeights.reduce((s, h) => s + (h - mean) ** 2, 0) / n;
  const cov = Math.sqrt(variance) / mean;

  // Direction check: is the trend dropping?
  // Compare first-half mean vs second-half mean.
  const mid = Math.floor(n / 2);
  const firstHalf = breakingHeights.slice(0, mid);
  const secondHalf = breakingHeights.slice(mid);
  const firstMean = firstHalf.reduce((s, h) => s + h, 0) / firstHalf.length;
  const secondMean = secondHalf.reduce((s, h) => s + h, 0) / secondHalf.length;
  // "Dropping" when second half is >15% lower than first half AND CoV is elevated.
  const dropping = secondMean < firstMean * 0.85 && cov > 0.15;

  let label: ConsistencyLabel;
  if (dropping) {
    label = 'Dropping';
  } else if (cov < 0.15) {
    label = 'Steady';
  } else if (cov < 0.35) {
    label = 'Variable';
  } else {
    label = 'Dropping'; // high CoV without a clear trend → treat as unstable
  }

  return { label, value: cov, metric: 'TEMPORAL' };
}

// ─── Candidate A — Swell dominance / cleanliness (not shipped by default) ────

/**
 * Swell dominance: fraction of wave energy attributable to swell.
 * Calls chopIndex() from utils/scoring — do not copy the formula here.
 *
 * WARNING: inherits the Open-Meteo modal-partition caveat documented above.
 * Any ratio built on swell_wave_height + wind_wave_height carries that error.
 *
 * @param swellH     Swell wave height (m) — Open-Meteo swell_wave_height.
 * @param windWaveH  Wind-wave height (m) — Open-Meteo wind_wave_height.
 */
export function swellCleanliness(swellH: number, windWaveH: number): ConsistencyResult {
  // chopIndex returns windWaveH / (windWaveH + swellH): fraction that is chop.
  // Dominance = 1 - chop fraction.
  const chop = chopIndex(windWaveH, swellH);
  const dominance = 1 - chop; // swell fraction [0,1]

  let label: ConsistencyLabel;
  if (dominance >= 0.70) {
    label = 'Clean';
  } else if (dominance >= 0.40) {
    label = 'Mixed';
  } else {
    label = 'Messy';
  }

  return { label, value: dominance, metric: 'CLEANLINESS' };
}

// ─── Unified entry point ─────────────────────────────────────────────────────

/**
 * Compute consistency using whichever metric is selected by CONSISTENCY_METRIC.
 *
 * For TEMPORAL: pass breakingHeights (array of Hb over forecast window).
 * For CLEANLINESS: pass swellH and windWaveH (current values only).
 *
 * Both args are accepted on every call; the unused path is a no-op.
 */
export function waveConsistency(opts: {
  breakingHeights?: number[];
  swellH?: number;
  windWaveH?: number;
}): ConsistencyResult {
  if (CONSISTENCY_METRIC === 'CLEANLINESS') {
    return swellCleanliness(opts.swellH ?? 0, opts.windWaveH ?? 0);
  }
  return temporalSteadiness(opts.breakingHeights ?? []);
}
