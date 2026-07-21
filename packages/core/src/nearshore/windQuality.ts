import { ActivityPersona } from '../types/scoring';

// ─── Convention note ──────────────────────────────────────────────────────────
// shoreNormalFromDepthGradient uses atan2(East, North) for compass bearing —
// this is the CORRECT compass convention (not the math-standard atan2(y,x)).
// windQuality works in "toward-space": convert met wind-from → wind-toward,
// then compare toward vs shoreNormalDeg. angle=0 means pure offshore.

const EPS = 1e-4; // m/m — below ~0.1 m/km treated as flat. Real shelves are gentler than 0.01.

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

// ─── Persona-shaped wind-quality multiplier ────────────────────────────────────

/**
 * Map the wind-quality angle to a persona-specific multiplier in [0, 1].
 * angle = 0° → pure offshore, angle = 180° → pure onshore.
 *
 * WAVE_SURFER / BOOGIE_BOARDER: monotonic ↓ — offshore always better.
 * KITE_SURFER / WIND_SURFER: asymmetric V-curve — cross-shore is best, OFFSHORE IS WORST
 *   (getting blown out to sea). offshore(0°)=0.2 < onshore(180°)=0.8 is safety-critical.
 * All other personas: flat 1.0 (direction irrelevant to score).
 */
export function windQualityMultiplier(
  persona: ActivityPersona,
  angle: number,
): number {
  const t = angle / 180; // normalise to [0,1]: 0=offshore, 1=onshore
  switch (persona) {
    case ActivityPersona.WAVE_SURFER:
      // offshore=1.0, onshore=0.55; linear
      return 1.0 - 0.45 * t;
    case ActivityPersona.BOOGIE_BOARDER:
      // offshore=1.0, onshore=0.75; linear
      return 1.0 - 0.25 * t;
    case ActivityPersona.KITE_SURFER:
    case ActivityPersona.WIND_SURFER: {
      // V-curve: 0.2 → 1.0 over 0–90°, 1.0 → 0.8 over 90–180°
      const t2 = angle / 90;
      if (angle <= 90) return 0.2 + 0.8 * t2;           // 0.2 → 1.0
      return 1.0 - 0.2 * ((angle - 90) / 90);           // 1.0 → 0.8
    }
    default:
      return 1.0;
  }
}

/**
 * Returns true when conditions are hazardous for a kite/wind surfer due to offshore wind.
 * Offshore wind blows riders away from shore — dangerous even at moderate speeds.
 * Only fires for KITE_SURFER and WIND_SURFER; irrelevant for other personas.
 */
export function windHazard(
  persona: ActivityPersona,
  angle: number,
  windSpeedKmh: number,
): boolean {
  if (persona !== ActivityPersona.KITE_SURFER && persona !== ActivityPersona.WIND_SURFER) {
    return false;
  }
  return angle < 60 && windSpeedKmh >= 15;
}
