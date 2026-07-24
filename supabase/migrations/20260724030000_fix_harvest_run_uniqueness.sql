-- P6.2.11: harvest_run was added with DEFAULT 'pre-6.2.10', making every row identical.
-- A non-discriminating harvest_run defeats the purpose — unique index still collides.
-- Fix: backfill legacy rows with a per-row-distinct value, then remove the constant default.

-- Backfill legacy rows: use 'pre-6.2.10-' prefix with the row id for uniqueness
UPDATE calibration_residuals
  SET harvest_run = 'pre-6.2.10-' || id::text
  WHERE harvest_run = 'pre-6.2.10';

-- Remove the constant default so future harvests must explicitly supply harvest_run
ALTER TABLE calibration_residuals
  ALTER COLUMN harvest_run DROP DEFAULT;
