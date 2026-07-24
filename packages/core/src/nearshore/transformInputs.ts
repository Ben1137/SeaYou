/**
 * Canonical transform input resolver for the calibration harness.
 *
 * Rule for compare_basis='total_h_swell_tp' (P6.2.10 canonical):
 *   H0 = wave_height (total combined Hs — matches buoy WVHT)
 *   T  = swell_wave_period (swell mean period — best available swell-specific T from Open-Meteo)
 *
 * Open-Meteo field investigation (P6.2.10):
 *   wave_period = Tm (mean period, NOAA GRIB2 PERPW) — bundles wind sea, DO NOT use for dispersion
 *   swell_wave_period = swell mean period — swell-specific, consistently non-null in archive/forecast
 *   swell_wave_peak_period = null universally (confirmed: 0/72 non-null in archive tests)
 *   wave_peak_period = null universally (0/72 non-null)
 *   wind_wave_peak_period = null universally (0/72 non-null)
 *
 * swell_wave_period is the best available T: swell-specific (avoids wind-sea contamination),
 * consistently available. It is mean period not peak period, which will over-predict
 * nearshoreTransform output slightly — this is a known API limitation, not a code bug.
 *
 * Prior compare_basis='total_vs_total' rows used wave_period (total Tm) as T — tagged invalid_field_mismatch.
 *
 * No silent buoy-period fallback: missing T skips the row and is counted.
 * Band assignment uses the SAME T passed to nearshoreTransform.
 */

// ---------------------------------------------------------------------------
// STANDING CAVEAT: No peak period available from Open-Meteo
//
// nearshoreTransform's dispersion solve nominally expects a peak/characteristic
// period (Tp). Open-Meteo exposes no usable peak period on any current endpoint:
//   wave_peak_period:       0/72 non-null tested (field does not exist in practise)
//   swell_wave_peak_period: 0/72 non-null tested (returns null universally)
//   wind_wave_peak_period:  0/72 non-null tested (same)
//
// The canonical T used by this harness is `swell_wave_period`, which is:
//   NOAA GRIB2 Table 4-2-10-0, Entry 9: SWPER = "Mean Period of Swell Waves"
// i.e. Tm of the swell partition, not Tp.
//
// Consequence: all residuals carry a standing Tm-vs-Tp caveat.
// Since Tm < Tp for most sea states, the dispersion solve underestimates
// wavelength, which affects Ks and therefore engine_value.
//
// This is a provider limitation, not a per-round bug to re-litigate.
// Record it here once; do not restart analysis because of it.
// ---------------------------------------------------------------------------

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
  T:      number;       // swell_wave_period (swell mean Tm — best available swell-specific period; see STANDING CAVEAT)
  depthM: number;       // buoy.depthM (validation) or spot.depthM (product)
  band:   PeriodBand;   // period band — same T as passed to transform
}

export interface ModelHourFields {
  waveHeight:   number | null;  // wave_height (total Hs)
  /** swellWavePeriod — maps to swell_wave_period from Open-Meteo (swell mean period).
   *  NOT wave_period (Open-Meteo total Tm which bundles wind sea).
   *  NOT swell_wave_peak_period (returns null universally — P6.2.10 finding).
   *  See STANDING CAVEAT comment at top of file for Tm-vs-Tp implications. */
  swellWavePeriod: number | null;
}

/**
 * Resolve canonical {H0, T, depthM, band} for a model hour + spot.
 * Returns null if H0 or T is missing (row must be SKIPPED and counted).
 * Never substitutes buoy period for missing model period.
 *
 * @param modelHour - must contain waveHeight (wave_height) and swellWavePeriod (swell_wave_period)
 * @param buoyDepthM - the buoy's actual deployment depth (buoy.depthM)
 */
export function resolveTransformInputs(
  modelHour: ModelHourFields,
  buoyDepthM: number,
): TransformInputs | null {
  if (modelHour.waveHeight == null || isNaN(modelHour.waveHeight)) return null;
  if (modelHour.swellWavePeriod == null || isNaN(modelHour.swellWavePeriod)) return null;
  const b = resolveBand(modelHour.swellWavePeriod);
  if (b == null) return null;
  return {
    H0:     modelHour.waveHeight,
    T:      modelHour.swellWavePeriod,
    depthM: buoyDepthM,
    band:   b,
  };
}
