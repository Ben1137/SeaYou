-- P6.2.9: store wave_period (total spectral peak period) — the canonical T
-- actually passed to nearshoreTransform. swell_period remains a feature column only.
-- Without this, SQL cannot band by the same field the transform used.
ALTER TABLE calibration_residuals
  ADD COLUMN IF NOT EXISTS wave_period DOUBLE PRECISION;
