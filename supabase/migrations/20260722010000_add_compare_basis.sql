-- P6.2: Add compare_basis column to calibration_residuals
-- Tracks whether the comparison is total-vs-total or swell-vs-swell.
-- Legacy rows (P6.0 backfill, swell-only-vs-total) are tagged 'swell_only_legacy'
-- and must be excluded from clean P6.3 training.

-- Add the column with a safe default for existing rows
ALTER TABLE calibration_residuals
  ADD COLUMN IF NOT EXISTS compare_basis TEXT NOT NULL DEFAULT 'swell_only_legacy'
  CHECK (compare_basis IN ('total_vs_total', 'swell_vs_swell', 'swell_only_legacy'));

-- Tag the existing rows as legacy (they used swell_wave_height vs WVHT total)
-- The DEFAULT already sets them, this UPDATE is explicit documentation of intent.
UPDATE calibration_residuals
  SET compare_basis = 'swell_only_legacy'
  WHERE compare_basis = 'swell_only_legacy';

-- Extend unique index to include compare_basis so bases cannot collide
DROP INDEX IF EXISTS calibration_residuals_unique;
CREATE UNIQUE INDEX calibration_residuals_unique
  ON calibration_residuals (ts, spot, buoy_kind, input_source, compare_basis);
