-- P6.2.14: swell_height column semantic fix.
-- In backfillResiduals.ts rows, swell_height held H0 = wave_height (total Hs), not the swell partition.
-- In dataAssimilation.ts rows, swell_height held swell_wave_height (true swell partition).
-- After this fix, both paths write swell_wave_height into swell_height.
-- wave_height_total already stores total Hs correctly (added in P6.2.13).
--
-- The old backfill rows (data_quality = 'superseded_full_inputs') contained the wrong value.
-- New ok rows from the upcoming re-harvest will be correct.
-- No UPDATE of existing rows is needed — superseded rows are excluded from analysis.

-- Document the semantic intent of swell_height
COMMENT ON COLUMN calibration_residuals.swell_height IS
  'swell_wave_height (swell partition Hs). Prior to P6.2.14, backfill rows stored total Hs here — those rows are tagged superseded_full_inputs. Forward-assimilation rows have always been correct.';

COMMENT ON COLUMN calibration_residuals.wave_period IS
  'Stores swell_wave_period (swell mean Tm = canonical T for nearshoreTransform). Despite the name, this is NOT Open-Meteo wave_period (total Tm), which lives in wave_period_tm.';
