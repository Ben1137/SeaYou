/**
 * Body-scale wave height descriptors for surf personas.
 *
 * Input is breaking-wave height Hb from the Coastal Break engine
 * (nearshoreTransform().H), NOT offshore Hs. This distinction must be
 * maintained in every caller. If a future round wants face height instead,
 * apply a defined multiplier (typically 1.1–1.3×) at one place — do not
 * silently reinterpret the input.
 *
 * Intervals are half-open, lower-inclusive: [low, high).
 * 0.50 m → Thigh-high (not Knee-high). Unit tests enforce both sides of
 * every boundary.
 *
 * Surf idiom only. Do not display on Wind Surf, Kite, Mariner, or Diver
 * personas — body-part scale is meaningless (and potentially misleading)
 * outside the surf context.
 */

export type WaveScaleLabel =
  | 'Flat'
  | 'Ankle-high'
  | 'Knee-high'
  | 'Thigh-high'
  | 'Waist-high'
  | 'Chest-high'
  | 'Shoulder-high'
  | 'Head-high'
  | 'Overhead'
  | 'Well overhead'
  | 'Double overhead';

interface ScaleBracket {
  /** Lower bound (m), inclusive. */
  low: number;
  /** Upper bound (m), exclusive. Use Infinity for the top bracket. */
  high: number;
  label: WaveScaleLabel;
}

// Brackets ordered low → high. Half-open [low, high).
const BRACKETS: ScaleBracket[] = [
  { low: 0,    high: 0.15, label: 'Flat' },
  { low: 0.15, high: 0.30, label: 'Ankle-high' },
  { low: 0.30, high: 0.50, label: 'Knee-high' },
  { low: 0.50, high: 0.70, label: 'Thigh-high' },
  { low: 0.70, high: 0.95, label: 'Waist-high' },
  { low: 0.95, high: 1.20, label: 'Chest-high' },
  { low: 1.20, high: 1.50, label: 'Shoulder-high' },
  { low: 1.50, high: 1.80, label: 'Head-high' },
  { low: 1.80, high: 2.50, label: 'Overhead' },
  { low: 2.50, high: 3.50, label: 'Well overhead' },
  { low: 3.50, high: Infinity, label: 'Double overhead' },
];

/**
 * Map a breaking-wave height (m) to its body-scale descriptor.
 *
 * @param Hb  Breaking-wave height from nearshoreTransform().H (m). Must be ≥ 0.
 *            Negative values are clamped to 0 → 'Flat'.
 */
export function waveScaleLabel(Hb: number): WaveScaleLabel {
  const h = Math.max(0, Hb);
  for (const b of BRACKETS) {
    if (h >= b.low && h < b.high) return b.label;
  }
  // Unreachable: Infinity top bracket catches everything.
  return 'Double overhead';
}

/**
 * i18n key for a WaveScaleLabel.
 * Key form: waveScale.<camelCase>
 * e.g. waveScale.kneeHigh, waveScale.doubleOverhead
 */
export function waveScaleI18nKey(label: WaveScaleLabel): string {
  const camel = label
    .split('-')
    .map((w, i) => {
      const lower = w.toLowerCase();
      // Handle space-joined words (e.g. "Well overhead" → wellOverhead)
      return i === 0 ? lower : lower[0].toUpperCase() + lower.slice(1);
    })
    .join('')
    .replace(/\s+(\w)/g, (_, c: string) => c.toUpperCase());
  return `waveScale.${camel}`;
}

export { BRACKETS as WAVE_SCALE_BRACKETS };

// ─── Beachgoer safety labels (P5.6) ──────────────────────────────────────────

/**
 * Safety framing for the BEACHGOER persona.
 *
 * Input is Komar-Gaughan significant breaker height Hb (m), NOT offshore H0.
 * Hb ≈ 1.4–1.6× H0 at typical periods, so the bands are calibrated for Hb, not Hs.
 * Mis-using offshore H0 would over-warn: an H0=0.40m / Hb=0.57m day reads "Calm"
 * on Hb but would read "Mild" if the threshold were applied to raw H0.
 *
 * Bands (half-open [low, high)):
 *   Hb < 0.80 m   → "Calm — safe for swimming"
 *   0.80–1.20 m   → "Mild — wading conditions"
 *   1.20–1.80 m   → "Moderate surf — caution"
 *   1.80–2.80 m   → "Rough — hazardous for swimming"
 *   ≥ 2.80 m      → "Dangerous — do not enter"
 *
 * Band calibration (P5.6 sanity check, T=8s):
 *   Calm ceiling 0.80 Hb  ↔  H0 < 0.49 m  (flat Mediterranean day, swim OK)
 *   Mild ceiling 1.20 Hb  ↔  H0 < 0.81 m  (light beach conditions)
 *   Moderate    1.80 Hb   ↔  H0 < 1.35 m  (around Israeli Red Flag threshold)
 *   Rough       2.80 Hb   ↔  H0 < 2.35 m  (storm-adjacent)
 * Tel Aviv today (Hb=0.572 m) → Calm — confirmed (< 0.80 boundary).
 *
 * Period escalation (T≥12): NOT implemented as a discrete bump — K-G encodes
 * period continuously via T^0.4. A discrete bump would double-count the effect
 * and cause label flicker between forecast hours. The tooltip notes that
 * long-period surf may carry stronger rips at the same height.
 *
 * Returns an i18n key (e.g. 'beach.safetyCalm'), not a display string.
 */
export type BeachgoerSafetyLabel =
  | 'beach.safetyCalm'
  | 'beach.safetyMild'
  | 'beach.safetyModerate'
  | 'beach.safetyRough'
  | 'beach.safetyDangerous';

interface SafetyBracket {
  low: number;
  high: number;
  key: BeachgoerSafetyLabel;
}

const SAFETY_BRACKETS: SafetyBracket[] = [
  { low: 0,    high: 0.80, key: 'beach.safetyCalm'      },
  { low: 0.80, high: 1.20, key: 'beach.safetyMild'      },
  { low: 1.20, high: 1.80, key: 'beach.safetyModerate'  },
  { low: 1.80, high: 2.80, key: 'beach.safetyRough'     },
  { low: 2.80, high: Infinity, key: 'beach.safetyDangerous' },
];

/**
 * Return the beachgoer safety i18n key for a given Komar-Gaughan breaker height.
 *
 * @param HbMeters  Komar-Gaughan significant breaker height (m). NOT offshore H0.
 *                  Use komarGaughanBreakerHeight(H0, T) from transform.ts.
 */
export function beachgoerSafetyLabel(HbMeters: number): BeachgoerSafetyLabel {
  const h = Math.max(0, HbMeters);
  for (const b of SAFETY_BRACKETS) {
    if (h >= b.low && h < b.high) return b.key;
  }
  return 'beach.safetyDangerous';
}

export { SAFETY_BRACKETS as BEACH_SAFETY_BRACKETS };

// ─── i18n translation status ──────────────────────────────────────────────────
// TODO(i18n, P5.5.1/P5.6): The following locale strings need native-speaker review:
//
// waveScale.* (surf body-scale idioms):
//   de — machine-translated body-part terms (knöchelhoch etc.)
//   es — machine-translated (tobillo, rodilla etc.)
//   fr — machine-translated (cheville, genou etc.)
//   it — machine-translated (caviglia, ginocchio etc.)
//   ru — machine-translated (по щиколотку etc.)
//   he — English fallback (Israeli surf community uses EN terms — confirm with native)
//
// beach.safety* (beachgoer safety labels, added P5.6):
//   de/es/fr/it/ru/he — machine-translated; safety framing idioms in particular
//   may not match local beach-safety vocabulary. Flag for review before L10N launch.
//
// Do NOT show [UNREVIEWED] to users — English fallback renders cleanly.
