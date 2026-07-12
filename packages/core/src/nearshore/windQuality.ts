// ─── Convention note ──────────────────────────────────────────────────────────
// shoreNormalFromDepthGradient uses atan2(East, North) for compass bearing —
// this is the CORRECT compass convention (not the math-standard atan2(y,x)).
// windQuality works in "toward-space": convert met wind-from → wind-toward,
// then compare toward vs shoreNormalDeg. angle=0 means pure offshore.

const EPS = 0.01; // m/m — gradient below this is ambiguous

/**
 * Derive the offshore compass bearing (degrees [0,360)) from the depth gradient.
 * Depth is positive-down (deeper = larger), so the gradient vector (gradEast, gradNorth)
 * points toward increasing depth = toward open sea = offshore.
 *
 * Uses atan2(East, North) — the compass convention — NOT atan2(y, x).
 * Returns null when the gradient magnitude is below EPS (flat/ambiguous seafloor).
 */
export function shoreNormalFromDepthGradient(
  gradEast: number,
  gradNorth: number,
): number | null {
  if (Math.hypot(gradEast, gradNorth) < EPS) return null;
  const deg = (Math.atan2(gradEast, gradNorth) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/**
 * Classify wind quality for surfing given a meteorological wind-from direction
 * and the offshore bearing derived from the bathymetry gradient.
 *
 * Works in toward-space: windToward = (windFromDeg + 180) % 360.
 * angle = smallest arc between windToward and shoreNormalDeg, in [0,180].
 *   angle ≈ 0   → wind blows toward open sea → pure offshore → grooming → factor=1
 *   angle ≈ 180 → wind blows from open sea toward shore → pure onshore → factor=0
 *
 * factor = (1 + cos(angle_rad)) / 2   — smooth, monotonic, no tuning knobs.
 * label: offshore if angle < 60, cross if 60 ≤ angle ≤ 120, onshore if angle > 120.
 */
export function windQuality(
  windFromDeg: number,
  shoreNormalDeg: number,
): { factor: number; label: 'offshore' | 'cross' | 'onshore'; angle: number } {
  const windToward = ((windFromDeg + 180) % 360 + 360) % 360;
  let diff = ((windToward - shoreNormalDeg) % 360 + 360) % 360;
  if (diff > 180) diff = 360 - diff;
  const angle = diff; // [0,180]
  const factor = (1 + Math.cos((angle * Math.PI) / 180)) / 2;
  const label: 'offshore' | 'cross' | 'onshore' =
    angle < 60 ? 'offshore' : angle <= 120 ? 'cross' : 'onshore';
  return { factor, label, angle };
}
