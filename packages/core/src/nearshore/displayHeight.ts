/**
 * displayHeight.ts — Damp displayed breaker height for short-period swell.
 *
 * The Komar-Gaughan breaker height is an idealized theoretical ceiling that
 * assumes optimal conditions. In reality, short-period wind-waves lose energy
 * to:
 *   1. Steepness-induced viscous dissipation (wind-waves are high-steepness)
 *   2. Onshore wind interaction (separate from offshore wind quality score)
 *   3. Surface chop (whitecap foam)
 *
 * This helper applies a smooth damping factor to the RAW breaker height so the
 * DISPLAYED height reflects these losses. The damping is:
 *   - ~1.0 for long-period groundswell (T ≳ 12–14 s) — no penalty
 *   - Smoothly falling for shorter periods — T=8s gets moderate penalty
 *   - ~0.5–0.7 for very short wind-swell (T=4–5 s) — large penalty
 *
 * Physics basis:
 *   - T² is proportional to wavelength L (deep water: L ≈ gT²/2π)
 *   - Deep-water steepness H0/L scales inversely with T²
 *   - Short-period waves (T=5s) have steepness ~10× longer-period swell (T=14s)
 *   - High steepness → increased viscous dissipation + wind sensitivity
 *
 * Implementation: smoothstep-based curve, symmetric tuning avoids overfitting.
 * The curve is deliberately conservative (keeps the score high) to avoid user
 * misinterpretation as a real forecast when it is only indicative.
 */

export interface BreakerdHeightDisplayFactorParams {
  /** Wave period (s). */
  T: number;
  /** Deep-water wave height (m) — optional, used for future exposure context. */
  H0?: number;
  /** Exposure factor [0,1] if available from raycast/geom — optional. */
  exposureFactor?: number;
}

/**
 * Compute a damping factor [0,1] for display breaker height.
 *
 * @param T — wave period (s)
 * @param H0 — deep-water wave height (m), optional, not yet used
 * @param exposureFactor — seafloor/geometry exposure [0,1], optional
 * @returns factor in [0,1]; multiply displayed HBreaker by this
 *
 * Examples:
 *   T=14s (long-period groundswell) → ~0.95–1.0 (no damping)
 *   T=10s (medium swell) → ~0.75–0.85 (modest damping)
 *   T=6s (short wind-swell) → ~0.45–0.60 (substantial damping)
 *   T=4s (chop) → ~0.30–0.40 (severe damping)
 *
 * Curve shape: smoothstep with control points tuned to reflect physical loss.
 * Does NOT model onshore wind (that is a separate QUALITY decision); only
 * models intrinsic losses from steepness and chop.
 */
export function breakerDisplayFactor(params: BreakerdHeightDisplayFactorParams): number {
  const { T, H0, exposureFactor } = params;

  if (!isFinite(T) || T <= 0) return 1.0;

  // Long-period swell (T ≥ 14 s): pass through, factor ≈ 1.0
  // Medium swell (T = 8–14 s): smoothly fall toward 0.8
  // Short-period (T = 4–8 s): steeper fall toward 0.4
  // Very short chop (T < 4 s): asymptote near 0.3

  // Reference control points (tuned to physics + Gordon exemplar):
  const T_long = 14;    // Long-period threshold
  const T_short = 4;    // Short-period floor
  const factor_long = 1.0;  // No penalty for long-period
  const factor_short = 0.35; // 35% of raw K-G for T=4s chop

  // Smoothstep between T_short and T_long
  // For T in [T_short, T_long], factor = smoothstep(factor_short, factor_long, (T - T_short) / (T_long - T_short))
  // For T > T_long, factor = factor_long (clamp to 1.0)
  // For T < T_short, factor = factor_short (clamp to 0.35)

  if (T >= T_long) {
    return factor_long;
  }
  if (T <= T_short) {
    return factor_short;
  }

  // T is in (T_short, T_long) — apply smoothstep
  const t = (T - T_short) / (T_long - T_short); // [0, 1]
  // smoothstep: 3t² - 2t³ (easing curve, smooth at edges)
  const t_smooth = 3 * t * t - 2 * t * t * t;
  // Interpolate from factor_short to factor_long
  const factor = factor_short + t_smooth * (factor_long - factor_short);

  // Future extension: apply exposureFactor modulation here if available.
  // exposureFactor [0,1] could modulate the penalty magnitude:
  //   factor = factor + (1 - factor) * (1 - exposureFactor) * 0.2
  // (shelter reduces the penalty). Left for Phase 6.

  return Math.max(0, Math.min(1, factor));
}
