-- P6.2.13: Store the full input set so future policy questions are recomputation questions.
-- Design rule: store inputs, not derived values. No second engine_value, no computed H0.
-- All new columns nullable — null means "provider did not serve it", which is itself data.

-- Model-side inputs (Open-Meteo, per row)
ALTER TABLE calibration_residuals ADD COLUMN IF NOT EXISTS wave_height_total   DOUBLE PRECISION; -- wave_height (total combined Hs)
ALTER TABLE calibration_residuals ADD COLUMN IF NOT EXISTS wind_wave_height    DOUBLE PRECISION; -- wind_wave_height
ALTER TABLE calibration_residuals ADD COLUMN IF NOT EXISTS wave_period_tm      DOUBLE PRECISION; -- wave_period (Open-Meteo = total Tm, NOAA GRIB2 PERPW)
ALTER TABLE calibration_residuals ADD COLUMN IF NOT EXISTS wind_wave_period    DOUBLE PRECISION; -- wind_wave_period
ALTER TABLE calibration_residuals ADD COLUMN IF NOT EXISTS wind_wave_direction DOUBLE PRECISION; -- wind_wave_direction (deg)

-- Buoy-side observations (per row)
ALTER TABLE calibration_residuals ADD COLUMN IF NOT EXISTS buoy_hs        DOUBLE PRECISION; -- same as buoy_value but explicitly named
ALTER TABLE calibration_residuals ADD COLUMN IF NOT EXISTS buoy_tp        DOUBLE PRECISION; -- CDIP waveTp / NDBC DPD — true peak period
ALTER TABLE calibration_residuals ADD COLUMN IF NOT EXISTS buoy_tm        DOUBLE PRECISION; -- NDBC APD — average period; null for CDIP
ALTER TABLE calibration_residuals ADD COLUMN IF NOT EXISTS buoy_direction DOUBLE PRECISION; -- MWD (NDBC) or waveDp (CDIP) in degrees

-- Provenance / geometry
ALTER TABLE calibration_residuals ADD COLUMN IF NOT EXISTS transform_depth_m DOUBLE PRECISION; -- actual depth passed to nearshoreTransform

-- Note: wave_period column (added P6.2.9) currently stores swell_wave_period (SWPER/canonical T)
-- Note: swell_height column stores swell_wave_height (NOT total Hs — confusingly named)
-- Note: buoy_value column stores buoy Hs (= buoy_hs, duplicated here for clarity)
-- Note: harvest_run column already exists from P6.2.10
-- Note: engine_version column already exists

-- Extend data_quality CHECK to include superseded_full_inputs
ALTER TABLE calibration_residuals DROP CONSTRAINT IF EXISTS calibration_residuals_data_quality_check;
ALTER TABLE calibration_residuals ADD CONSTRAINT calibration_residuals_data_quality_check
  CHECK (data_quality IN (
    'ok',
    'invalid_wrong_station',
    'invalid_wrong_depth',
    'invalid_wrong_buoy_coords',
    'invalid_field_mismatch',
    'invalid_test',
    'superseded_full_inputs'
  ));
