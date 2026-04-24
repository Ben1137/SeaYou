-- ─────────────────────────────────────────────────────────────────────────
-- Migration: create_navigation_tables (Phase 6 — Cloud Sync & Voyage Logs)
--
-- Adds two tables that back the Route Planner's cloud-sync feature:
--
--   public.user_routes
--     Saved / planned routes. One row per route the user has drawn in the
--     planner. `waypoints` + `vessel_settings` are JSONB blobs so we can
--     evolve the client-side schema without another migration per field.
--
--   public.voyage_logs
--     Persistent record of a completed navigation session — the actual
--     GPS track history, departure / arrival timestamps, and trip stats.
--     `route_id` is nullable so free-sail voyages (no planned route) can
--     still be logged.
--
-- Both tables use Row-Level Security following the `user_preferences`
-- audit pattern from migration 20260419120000: enabled RLS, policy set
-- covers SELECT / INSERT / UPDATE / DELETE, each keyed on
-- `auth.uid() = user_id` so a user can only see and mutate their own
-- rows. UPDATE policies include WITH CHECK to satisfy PostgREST upsert.
--
-- Idempotent: safe to re-run against a populated database. Drops and
-- re-creates the policy set on each run so we converge on a known-good
-- state even if an earlier revision shipped a weaker variant.
--
-- Verification (run as the target user after apply):
--
--   SELECT relrowsecurity FROM pg_class
--    WHERE relname IN ('user_routes','voyage_logs');
--   -- expect: t, t
--
--   SELECT polname, polcmd
--     FROM pg_policy
--    WHERE polrelid IN ('public.user_routes'::regclass,
--                       'public.voyage_logs'::regclass)
--    ORDER BY polrelid::text, polname;
--   -- expect: read / insert / update / delete policies on each table.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. user_routes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_routes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  waypoints       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  vessel_settings jsonb       NOT NULL DEFAULT '{}'::jsonb,
  distance_nm     numeric(10,3),
  duration_min    numeric(10,2),
  average_speed   numeric(6,2),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_routes_user_id_idx
  ON public.user_routes (user_id, updated_at DESC);

ALTER TABLE public.user_routes ENABLE ROW LEVEL SECURITY;

-- Drop any prior policy set so re-runs converge on a known state.
DROP POLICY IF EXISTS "read own routes"   ON public.user_routes;
DROP POLICY IF EXISTS "insert own routes" ON public.user_routes;
DROP POLICY IF EXISTS "update own routes" ON public.user_routes;
DROP POLICY IF EXISTS "delete own routes" ON public.user_routes;

CREATE POLICY "read own routes"
  ON public.user_routes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert own routes"
  ON public.user_routes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update own routes"
  ON public.user_routes
  FOR UPDATE
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete own routes"
  ON public.user_routes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Keep updated_at honest regardless of what the client sends.
CREATE OR REPLACE FUNCTION public.set_user_routes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_routes_set_updated_at ON public.user_routes;
CREATE TRIGGER user_routes_set_updated_at
  BEFORE UPDATE ON public.user_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_routes_updated_at();


-- 2. voyage_logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voyage_logs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Nullable: a free-sail voyage may have no planned route. ON DELETE
  -- SET NULL so deleting a route doesn't wipe the voyage record.
  route_id           uuid        REFERENCES public.user_routes(id) ON DELETE SET NULL,
  name               text,
  -- GeoJSON LineString with per-point timestamp/speed in coordTimes.
  track_history      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  start_time         timestamptz NOT NULL,
  end_time           timestamptz NOT NULL,
  distance_traveled  numeric(10,3) NOT NULL DEFAULT 0,
  max_speed          numeric(6,2)  NOT NULL DEFAULT 0,
  avg_speed          numeric(6,2)  NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voyage_logs_user_id_idx
  ON public.voyage_logs (user_id, end_time DESC);

ALTER TABLE public.voyage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own voyages"   ON public.voyage_logs;
DROP POLICY IF EXISTS "insert own voyages" ON public.voyage_logs;
DROP POLICY IF EXISTS "update own voyages" ON public.voyage_logs;
DROP POLICY IF EXISTS "delete own voyages" ON public.voyage_logs;

CREATE POLICY "read own voyages"
  ON public.voyage_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert own voyages"
  ON public.voyage_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update own voyages"
  ON public.voyage_logs
  FOR UPDATE
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete own voyages"
  ON public.voyage_logs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
