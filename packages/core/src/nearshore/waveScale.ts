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

// ─── i18n translation status ──────────────────────────────────────────────────
// TODO(i18n): Body-scale idioms require native surf-speaker review in every
// non-English locale. Current state (as of P5.5.1, 2026-08-03):
//   de — machine-translated body-part terms (knöchelhoch etc.) — review needed
//   es — machine-translated (tobillo, rodilla etc.) — review needed
//   fr — machine-translated (cheville, genou etc.) — review needed
//   it — machine-translated (caviglia, ginocchio etc.) — review needed
//   ru — machine-translated (по щиколотку etc.) — review needed
//   he — English fallback values used (Israeli surf community uses EN terms) — confirm with native speaker
// Do NOT ship these as "final" translations for body-scale terms. They are
// functional defaults that will not show [UNREVIEWED] to users, but they may
// read unnaturally in each language's surf context.
