/**
 * Nearshore wave dispersion — Fenton & McKee (1990) explicit approximation.
 * Avoids iterating the full dispersion relation in tight per-pixel paths.
 *
 * Reference: Fenton J.D. & McKee W.D. (1990) "On calculating the lengths of water waves."
 * Coastal Engineering, 14(6), 499-513.
 */

export const G = 9.81; // m s⁻²

export interface DispersionResult {
  /** Local wavelength L (m) */
  L: number;
  /** Wave number k = 2π/L (rad m⁻¹) */
  k: number;
  /** Phase speed C = L/T (m s⁻¹) */
  C: number;
  /** Ratio n = Cg/C (dimensionless) */
  n: number;
  /** Group speed Cg = n·C (m s⁻¹) */
  Cg: number;
}

/**
 * Deep-water wavelength L0 = g·T² / (2π).
 */
export function deepWaterWavelength(T: number): number {
  return (G * T * T) / (2 * Math.PI);
}

/**
 * Deep-water phase speed C0 = g·T / (2π).
 */
export function deepWaterPhaseSpeed(T: number): number {
  return (G * T) / (2 * Math.PI);
}

/**
 * Deep-water group speed Cg0 = C0 / 2.
 */
export function deepWaterGroupSpeed(T: number): number {
  return deepWaterPhaseSpeed(T) / 2;
}

/**
 * Compute local dispersion quantities at depth d (m, positive downward) for
 * a wave of period T (s) using the Fenton-McKee explicit approximation.
 *
 * Valid range: any finite positive depth. Deep water (d >> L0) → Ks ≈ 1.
 * Returns deep-water values when d >= 0.5·L0 (deep-water threshold).
 */
export function dispersion(T: number, d: number): DispersionResult {
  const L0 = deepWaterWavelength(T);
  const C0 = deepWaterPhaseSpeed(T);
  const Cg0 = C0 / 2;

  // Guard: extremely shallow or negative depth — clamp to a minimum to avoid
  // division by zero without silently exploding. Caller should check `breaking`.
  const dSafe = Math.max(d, 0.01);

  // Fenton-McKee approximation for L at depth d:
  // L = L0 · tanh( (ω²·d/g)^(3/4) )^(2/3)
  const omega = (2 * Math.PI) / T;
  const x = (omega * omega * dSafe) / G;
  const L = L0 * Math.pow(Math.tanh(Math.pow(x, 0.75)), 2 / 3);

  const k = (2 * Math.PI) / L;
  const C = L / T;

  // n = ½·(1 + 2kd/sinh(2kd)); n → 0.5 deep water, n → 1 shallow water
  const kd2 = 2 * k * dSafe;
  const sinh2kd = Math.sinh(kd2);
  // Guard against sinh overflow for very deep water (kd large → sinh → ∞ → n → 0.5)
  const n = sinh2kd > 1e10 ? 0.5 : 0.5 * (1 + kd2 / sinh2kd);

  const Cg = n * C;

  return { L, k, C, n, Cg };
}
