-- P6.2.12: data_quality is a mutable label, not part of an observation's identity.
-- Including it in the unique index meant re-tagging rows could collide.
-- The identity of a calibration observation is: when + where + which source + which basis + which run.
-- data_quality labels an observation's validity status — it changes; the observation's identity does not.

-- Drop the old index (includes data_quality and harvest_run)
DROP INDEX IF EXISTS calibration_residuals_unique;

-- Rebuild on observation identity only
CREATE UNIQUE INDEX calibration_residuals_unique
  ON calibration_residuals (ts, spot, buoy_kind, input_source, compare_basis, harvest_run);
