-- P6.2.10: Three schema changes.
-- 1. wave_period column: repurpose to store the canonical T (swell_wave_peak_period = true Tp).
--    Rename comment: this column holds the T actually passed to nearshoreTransform, which is
--    swell_wave_peak_period (Tp), NOT Open-Meteo's wave_period field (which is Tm / NOAA GRIB2 PERPW).
-- 2. Add harvest_run TEXT: populated with engine git SHA at harvest time.
--    Included in unique index so re-tagging never collides — structural fix for repeated DELETEs.
-- 3. Extend CHECK constraint on compare_basis to include 'total_h_swell_tp'.

-- Add harvest_run column
ALTER TABLE calibration_residuals
  ADD COLUMN IF NOT EXISTS harvest_run TEXT NOT NULL DEFAULT 'pre-6.2.10';

-- Extend compare_basis CHECK to include the new canonical basis
ALTER TABLE calibration_residuals
  DROP CONSTRAINT IF EXISTS calibration_residuals_compare_basis_check;
ALTER TABLE calibration_residuals
  ADD CONSTRAINT calibration_residuals_compare_basis_check
  CHECK (compare_basis IN (
    'total_vs_total',
    'swell_vs_swell',
    'swell_only_legacy',
    'total_h_swell_tp'
  ));

-- Rebuild unique index to include harvest_run (prevents collision on re-tag)
DROP INDEX IF EXISTS calibration_residuals_unique;
CREATE UNIQUE INDEX calibration_residuals_unique
  ON calibration_residuals (ts, spot, buoy_kind, input_source, compare_basis, data_quality, harvest_run);
