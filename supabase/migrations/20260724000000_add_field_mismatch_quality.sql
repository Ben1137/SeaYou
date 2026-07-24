-- P6.2.8: Add field_mismatch tag to data_quality CHECK constraint.
-- Scripps rows computed with swell_wave_period instead of wave_period get this tag.

ALTER TABLE calibration_residuals
  DROP CONSTRAINT IF EXISTS calibration_residuals_data_quality_check;

ALTER TABLE calibration_residuals
  ADD CONSTRAINT calibration_residuals_data_quality_check
  CHECK (data_quality IN (
    'ok',
    'invalid_wrong_station',
    'invalid_wrong_depth',
    'invalid_wrong_buoy_coords',
    'invalid_field_mismatch'
  ));
