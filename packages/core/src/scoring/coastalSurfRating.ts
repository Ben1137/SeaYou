/**
 * coastalSurfRating — Modelled surf rating fusing nearshore reading with existing helpers.
 *
 * A per-spot 0–100 "surf rating" that combines:
 *   • Size: breaking height sweet-spot (0.5–2.5 m ideal for most surfers)
 *   • Power: period sweet-spot (8–16 s ideal)
 *   • Cleanliness: primary energy fraction + wind chop reduction
 *   • Wind: onshore/cross/offshore via windQualityMultiplier (WAVE_SURFER persona)
 *
 * INDICATIVE only — not calibrated to real buoy data. Model confidence:
 *   • High: when all inputs present (breaking height, period, wind direction, shore normal, both partitions)
 *   • Low: when partitions/shore normal missing (degrades gracefully)
 *
 * Weights: size 0.35 · power 0.25 · cleanliness 0.25 · wind 0.15 = 1.00
 */

import type { ScoreFactor } from '../types/scoring';
import { ActivityPersona } from '../types/scoring';
import { sweetSpotScore, chopIndex, scoreToLabel } from '../utils/scoring';
import { windQuality, windQualityMultiplier } from '../nearshore/windQuality';

export interface CoastalSurfRatingInputs {
  /**
   * Breaking height (m) — output of nearshoreTransform (tide + refraction applied).
   * Usually the Komar-Gaughan estimate; null when depth/conditions unavailable.
   */
  breakingHeight: number | null;

  /** Dominant swell period (s) used in the physics transform. */
  period: number | null;

  /** Primary swell partition height (m) — used for energy fraction. */
  primaryHeight: number | null;

  /** Secondary swell partition height (m), or null if absent/negligible. */
  secondaryHeight: number | null;

  /**
   * Offshore compass bearing derived from depth gradient (degrees [0,360)),
   * or null if seafloor is flat/ambiguous.
   */
  shoreNormalDeg: number | null;

  /** Meteorological wind-from direction (degrees [0,360)). */
  windDirection: number;

  /** Wind speed (km/h). */
  windSpeed: number;

  /** Wind-wave height (m), used for chop index. */
  windWaveHeight: number;

  /** Swell height (m), used for chop index. */
  swellHeight: number;
}

export interface CoastalSurfRatingResult {
  /** Overall 0–100 rating. */
  overall: number;

  /** Human label (Epic, Good, Fair, Poor, Dangerous) and Tailwind color class. */
  label: string;
  color: string;

  /** Per-factor numeric scores [0,100]. */
  factors: Record<string, number>;

  /** Breakdown rows for the UI (label, value, impact). */
  breakdown: ScoreFactor[];

  /**
   * Confidence indicator: 'high' when all key inputs present, 'low' when
   * partitions/shore normal missing (still renders, but may be less predictive).
   */
  confidence: 'high' | 'low';
}

/** Build a single `ScoreFactor` row given a 0-100 numeric score. */
function factorRow(label: string, value: string, score: number): ScoreFactor {
  const impact: ScoreFactor['impact'] = score >= 70 ? 'positive' : score >= 40 ? 'neutral' : 'negative';
  return { label, value, impact };
}

/** Format height for display. */
const fmtM = (n: number) => `${n.toFixed(1)} m`;

/** Format period for display. */
const fmtS = (n: number) => `${n.toFixed(1)} s`;

/** Format percentage for display. */
const fmtPct = (n: number) => `${Math.round(n)}%`;

/**
 * Compute the surf rating from a coastal reading + environment.
 * All inputs can be null/missing; the rating degrades gracefully.
 */
export function coastalSurfRating(inputs: CoastalSurfRatingInputs): CoastalSurfRatingResult {
  // Determine confidence: high when all key inputs present
  const hasAllPartitions = inputs.primaryHeight != null && inputs.secondaryHeight != null;
  const hasShoreNormal = inputs.shoreNormalDeg != null;
  const confidence = inputs.breakingHeight != null && inputs.period != null && hasShoreNormal && hasAllPartitions
    ? 'high'
    : 'low';

  const factors: Record<string, number> = {};
  const breakdown: ScoreFactor[] = [];

  // ─── Size: breaking height sweet-spot ────────────────────────────────────────
  // Ideal 0.5–2.5 m for most wave surfers (varies by local skill/spot).
  // Fades at 0.1 m (too small) and 4.0 m (dangerous/experienced only).
  const H = inputs.breakingHeight ?? 0;
  factors.size = sweetSpotScore(H, 0.1, 0.5, 2.5, 4.0);
  breakdown.push(factorRow('Wave Size', fmtM(H), factors.size));

  // ─── Power: period sweet-spot ────────────────────────────────────────────────
  // Ideal 8–16 s for most wave surfers (longer = better energy transfer).
  // Fades at 4 s (choppy, short-period wind-waves) and 20 s (rare/edge case).
  const T = inputs.period ?? 0;
  factors.power = sweetSpotScore(T, 4, 8, 16, 20);
  breakdown.push(factorRow('Period', fmtS(T), factors.power));

  // ─── Cleanliness: energy partition + wind chop ──────────────────────────────
  // Measure swell purity as primary energy fraction: Hp² / (Hp² + Hs²).
  // When secondary is absent, assume 100% purity. Combine with chop index.
  let primaryFraction = 1.0;
  if (inputs.primaryHeight != null && inputs.primaryHeight > 0) {
    const Hp2 = inputs.primaryHeight * inputs.primaryHeight;
    const Hs2 = inputs.secondaryHeight && inputs.secondaryHeight > 0
      ? inputs.secondaryHeight * inputs.secondaryHeight
      : 0;
    primaryFraction = Hp2 / (Hp2 + Hs2 + 1e-6); // [0, 1]
  }

  const chop = chopIndex(inputs.windWaveHeight, inputs.swellHeight); // [0, 1], 0=clean, 1=pure chop
  const cleanlinessScore = (0.7 * primaryFraction + 0.3 * (1 - chop)) * 100;
  factors.cleanliness = cleanlinessScore;
  breakdown.push(
    factorRow('Swell Purity', fmtPct(primaryFraction * 100), primaryFraction * 100),
    factorRow('Chop', fmtM(inputs.windWaveHeight), (1 - chop) * 100)
  );

  // ─── Wind: offshore/cross/onshore via windQualityMultiplier ─────────────────
  // Use WAVE_SURFER persona: offshore=good, onshore=bad.
  // If shore normal is missing, assume optimal (factor=1.0).
  let windFactor = 1.0;
  if (inputs.shoreNormalDeg != null) {
    const wq = windQuality(inputs.windDirection, inputs.shoreNormalDeg);
    windFactor = windQualityMultiplier(ActivityPersona.WAVE_SURFER, wq.angle);
    const windScore = windFactor * 100;
    breakdown.push(factorRow('Wind Quality', wq.label.charAt(0).toUpperCase() + wq.label.slice(1), windScore));
  } else {
    breakdown.push(factorRow('Wind Quality', 'Unknown', 100));
  }
  factors.wind = windFactor * 100;

  // ─── Overall: weighted sum ──────────────────────────────────────────────────
  // Weights: size 0.35 · power 0.25 · cleanliness 0.25 · wind 0.15
  const overall = Math.max(0, Math.min(100,
    factors.size * 0.35 +
    factors.power * 0.25 +
    factors.cleanliness * 0.25 +
    factors.wind * 0.15
  ));

  const { label, color } = scoreToLabel(Math.round(overall));

  return {
    overall: Math.round(overall),
    label,
    color,
    factors,
    breakdown,
    confidence,
  };
}
