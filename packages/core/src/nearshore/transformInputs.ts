/**
 * Canonical transform input resolver for the calibration harness.
 *
 * Rule for compare_basis='total_vs_total':
 *   H0 = wave_height (total combined sea state)
 *   T  = wave_period (total spectral peak period — matches the height field)
 *
 * Pairing wave_height with swell_wave_period is a definitional mismatch
 * (same family as swell-vs-total and wrong-depth bugs).
 *
 * No silent buoy-period fallback: missing T skips the row and is counted.
 * Band assignment uses the SAME T passed to nearshoreTransform.
 */

export type PeriodBand = 'short' | 'mid' | 'long';

/** Returns null if T is not available — callers must skip null results. */
export function resolveBand(T: number | null | undefined): PeriodBand | null {
  if (T == null || isNaN(T)) return null;
  if (T < 8) return 'short';
  if (T <= 12) return 'mid';
  return 'long';
}

export interface TransformInputs {
  H0:     number;       // wave_height (total Hs)
  T:      number;       // wave_period (total peak period)
  depthM: number;       // buoy.depthM (validation) or spot.depthM (product)
  band:   PeriodBand;   // period band — same T as passed to transform
}

export interface ModelHourFields {
  waveHeight:  number | null;
  /** wave_period = total spectral peak period — NOT swell_wave_period */
  wavePeriod:  number | null;
}

/**
 * Resolve canonical {H0, T, depthM, band} for a model hour + spot.
 * Returns null if H0 or T is missing (row must be SKIPPED and counted).
 * Never substitutes buoy period for missing model period.
 *
 * @param modelHour - must contain waveHeight (wave_height) and wavePeriod (wave_period)
 * @param buoyDepthM - the buoy's actual deployment depth (buoy.depthM)
 */
export function resolveTransformInputs(
  modelHour: ModelHourFields,
  buoyDepthM: number,
): TransformInputs | null {
  if (modelHour.waveHeight == null || isNaN(modelHour.waveHeight)) return null;
  if (modelHour.wavePeriod  == null || isNaN(modelHour.wavePeriod))  return null;
  const b = resolveBand(modelHour.wavePeriod);
  if (b == null) return null;
  return {
    H0:     modelHour.waveHeight,
    T:      modelHour.wavePeriod,
    depthM: buoyDepthM,
    band:   b,
  };
}
