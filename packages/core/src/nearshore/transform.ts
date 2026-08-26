/**
 * Nearshore wave transformation: shoaling, refraction (Snell's law), and
 * depth-limited breaking.
 *
 * All lengths in metres, angles in degrees (converted internally to radians),
 * depths positive-downward (matching GEBCO convention).
 * "Effective depth" = GEBCO depth + tide height (sea_level_height_msl).
 */

import { G, deepWaterGroupSpeed, deepWaterPhaseSpeed, dispersion } from './dispersion';

/** Breaker index γ — standard empirical value (Miche 1944 / Battjes 1974). */
export const GAMMA = 0.78;

export interface TransformResult {
  /** Estimated wave height at depth d (m). Capped at γ·d if breaking. */
  H: number;
  /** Shoaling coefficient Ks (dimensionless) */
  Ks: number;
  /** Refraction coefficient Kr (dimensionless). 1.0 when refraction is skipped. */
  Kr: number;
  /** True when the depth-limited breaking condition H > γ·d was triggered. */
  breaking: boolean;
  /** Breaking-wave height cap γ·d at the given depth (m). */
  breakingCap: number;
}

/**
 * Shoaling coefficient Ks = sqrt(Cg0 / Cg).
 *
 * @param T  Wave period (s)
 * @param d  Local water depth, positive downward (m)
 */
export function shoalingCoeff(T: number, d: number): number {
  const Cg0 = deepWaterGroupSpeed(T);
  const { Cg } = dispersion(T, d);
  return Math.sqrt(Cg0 / Cg);
}

/**
 * Deep-water incident angle for Snell refraction.
 *
 * Convention (critical for sign):
 *   shoreNormalDeg = offshore bearing from bathymetry gradient (compass 0-360).
 *   swellFromDeg = meteorological "from" direction (where waves originate, compass 0-360).
 *   theta0 = angle between swell propagation direction and shore-normal.
 *
 * Swell propagates TOWARD (swellFromDeg + 180) % 360.
 * theta0 = smallest arc between swell-toward and shore-normal, in [0, 90].
 *   theta0 ≈ 0°   → swell approach nearly perpendicular to shore → Ks ≈ Kr ≈ 1
 *   theta0 ≈ 90°  → swell approach nearly parallel to shore → sin(theta) ≈ 1
 *
 * @param swellFromDeg      Meteorological swell-from direction (degrees [0,360))
 * @param shoreNormalDeg    Offshore bearing from depth gradient (degrees [0,360), null if ambiguous)
 * @returns theta0 in degrees [0, 90] (unsigned), or 0 if shoreNormal is null/ambiguous
 */
export function incidentAngleFromDirections(
  swellFromDeg: number,
  shoreNormalDeg: number | null,
): number {
  if (shoreNormalDeg == null) {
    return 0; // Flat/ambiguous shelf → assume shore-normal incidence
  }

  // Swell propagates toward (swellFrom + 180) % 360
  const swellTowardDeg = ((swellFromDeg + 180) % 360 + 360) % 360;

  // Smallest arc between swell-toward and shore-normal
  let diff = ((swellTowardDeg - shoreNormalDeg) % 360 + 360) % 360;
  if (diff > 180) diff = 360 - diff; // Smallest arc: [0,180]

  // Map to [-90,90]: 0° = shore-normal, ±90° = parallel-to-shore
  // diff ∈ [0,180] → theta0 ∈ [-90, 90] after atan-like mapping
  // Use simple: if diff > 90, then theta0 = 180 - diff (reflex angles become negative)
  return diff > 90 ? 180 - diff : diff;
}

/**
 * Refraction coefficient Kr using Snell's law (straight parallel-contour
 * approximation). Indicative only — true refraction is non-local.
 *
 * @param T       Wave period (s)
 * @param d       Local depth (m)
 * @param theta0  Deep-water angle of incidence relative to shore-normal (deg)
 * @returns Kr, clamped to [0, 2] to avoid singularities near cos θ → 0
 */
export function refractionCoeff(T: number, d: number, theta0Deg: number): number {
  const C0 = deepWaterPhaseSpeed(T);
  const { C } = dispersion(T, d);
  const theta0 = (theta0Deg * Math.PI) / 180;
  const sinTheta = (C / C0) * Math.sin(theta0);
  // Clamp to [-1,1] to avoid asin domain errors in very shallow water
  const sinThetaClamped = Math.max(-1, Math.min(1, sinTheta));
  const theta = Math.asin(sinThetaClamped);
  const cosTheta0 = Math.cos(theta0);
  const cosTheta = Math.cos(theta);
  // Guard near-zero denominator (wave approaching along-shore)
  if (cosTheta < 1e-6) return 1.0;
  return Math.min(2, Math.sqrt(Math.abs(cosTheta0) / cosTheta));
}

/**
 * Full nearshore transform for a single swell train.
 *
 * @param H0         Deep-water significant height (m)
 * @param T          Wave period (s)
 * @param d          Effective water depth = GEBCO depth + tide (m, positive down)
 * @param theta0Deg  Deep-water angle to shore-normal (deg). Pass 0 to skip refraction (Kr=1).
 * @param applyRefraction  When false Kr=1 is used (Phase 3 default; Phase 4 enables).
 */
export function nearshoreTransform(
  H0: number,
  T: number,
  d: number,
  theta0Deg = 0,
  applyRefraction = false,
): TransformResult {
  const Ks = shoalingCoeff(T, d);
  const Kr = applyRefraction ? refractionCoeff(T, d, theta0Deg) : 1.0;
  const H = H0 * Ks * Kr;
  const breakingCap = GAMMA * d;
  const breaking = H > breakingCap && d > 0;
  return {
    H: breaking ? breakingCap : H,
    Ks,
    Kr,
    breaking,
    breakingCap,
  };
}

/**
 * Komar-Gaughan (1976) direct deep-water → breaker height estimate.
 * Independent of the shoaling path — useful as a cross-check.
 *
 * Hb = 0.39 · g^(1/5) · (T · H0²)^(2/5)
 */
export function komarGaughanBreakerHeight(H0: number, T: number): number {
  return 0.39 * Math.pow(G, 0.2) * Math.pow(T * H0 * H0, 0.4);
}
