-- P6.2.5: Add data_quality column to tag rows computed on bad metadata.
-- invalid_wrong_station: Santa Cruz rows using CDIP 028 (was 340km from target at Catalina)
-- invalid_wrong_depth: Scripps rows using depthM=10 (actual 41m)
-- invalid_wrong_buoy_coords: Pipeline HI rows where NDBC 51001 lat was off ~115km
-- Excluded from analysis/training like swell_only_legacy.

ALTER TABLE calibration_residuals
  ADD COLUMN IF NOT EXISTS data_quality TEXT NOT NULL DEFAULT 'ok'
  CHECK (data_quality IN ('ok', 'invalid_wrong_station', 'invalid_wrong_depth', 'invalid_wrong_buoy_coords'));

-- Tag Santa Cruz rows (wrong station — CDIP 028 was at Catalina, not Steamer Lane)
UPDATE calibration_residuals
  SET data_quality = 'invalid_wrong_station'
  WHERE spot = 'Santa Cruz CA';

-- Tag Scripps rows (computed with depthM=10, actual 41m)
UPDATE calibration_residuals
  SET data_quality = 'invalid_wrong_depth'
  WHERE spot = 'Scripps CA';

-- Tag Pipeline HI rows (NDBC 51001 lat was 23.445N, actual 24.475N — ~115km off)
UPDATE calibration_residuals
  SET data_quality = 'invalid_wrong_buoy_coords'
  WHERE spot = 'Pipeline HI';

-- Extend unique index to include data_quality to allow re-harvest under 'ok' tag
DROP INDEX IF EXISTS calibration_residuals_unique;
CREATE UNIQUE INDEX calibration_residuals_unique
  ON calibration_residuals (ts, spot, buoy_kind, input_source, compare_basis, data_quality);
