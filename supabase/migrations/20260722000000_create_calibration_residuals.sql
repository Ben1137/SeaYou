-- P6.0: Calibration residuals table
-- Unified store for P6.0 backfill + P6.2 forward harness → P6.3 ML training
CREATE TABLE IF NOT EXISTS calibration_residuals (
  id             BIGSERIAL PRIMARY KEY,
  ts             TIMESTAMPTZ NOT NULL,
  spot           TEXT        NOT NULL,
  lat            DOUBLE PRECISION NOT NULL,
  lon            DOUBLE PRECISION NOT NULL,
  swell_dir      DOUBLE PRECISION,
  swell_period   DOUBLE PRECISION,
  swell_height   DOUBLE PRECISION,
  wind_from_deg  DOUBLE PRECISION,
  wind_speed     DOUBLE PRECISION,
  buoy_kind      TEXT        NOT NULL CHECK (buoy_kind IN ('deep', 'nearshore')),
  -- 'reanalysis' = CMEMS/ERA5 (Open-Meteo historical); 'archive_forecast' = future ops data
  input_source   TEXT        NOT NULL CHECK (input_source IN ('reanalysis', 'archive_forecast', 'live_forecast')),
  engine_value   DOUBLE PRECISION NOT NULL,
  buoy_value     DOUBLE PRECISION NOT NULL,
  residual       DOUBLE PRECISION NOT NULL,
  source_buoy_id TEXT        NOT NULL,
  engine_version TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedup: one row per (ts, spot, buoy_kind, input_source)
CREATE UNIQUE INDEX IF NOT EXISTS calibration_residuals_unique
  ON calibration_residuals (ts, spot, buoy_kind, input_source);

-- Query index: spot + buoy_kind + input_source + time range
CREATE INDEX IF NOT EXISTS calibration_residuals_query
  ON calibration_residuals (spot, buoy_kind, input_source, ts);

-- Row-level security: service_role only for writes (prevents ML training data poisoning).
-- SELECT is also restricted to service_role; expose via a Supabase Edge Function or
-- authenticated role if a UI ever needs to read this data.
ALTER TABLE calibration_residuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_insert_calibration_residuals"
  ON calibration_residuals FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "allow_select_calibration_residuals"
  ON calibration_residuals FOR SELECT
  TO service_role
  USING (true);
