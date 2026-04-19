-- ─────────────────────────────────────────────────────────────────────────
-- Migration: user_preferences_rls_audit
--
-- Root cause (April 2026 QA sweep):
--   The web client's `upsertPreferences` call was silently failing to write
--   `onesignal_player_id`, `home_lat`, and `home_lon` into the JSONB blob.
--   Inspection found two possible failure modes on the database side:
--
--     1. The `user_preferences` table existed but had **no `UPDATE` policy**
--        — only `SELECT` and `INSERT` were granted. PostgREST's upsert
--        (INSERT ... ON CONFLICT DO UPDATE) requires BOTH policies; missing
--        UPDATE caused the ON CONFLICT branch to no-op and return an empty
--        row, matching the "[PreferencesSync] upsert returned no row" path
--        we were hitting in production logs.
--
--     2. Pre-existing UPDATE policies written with `USING` only (no
--        `WITH CHECK`) let the row-selection pass but could silently reject
--        the NEW row under stricter PostgREST versions, producing the same
--        no-op behaviour.
--
--   This migration is idempotent: it defines the table if missing, enables
--   RLS, then drops and re-creates the three policies so the set is known-
--   good regardless of the project's prior state. It is safe to run against
--   an already-populated production database — no data is touched.
--
-- Verification (run manually after apply):
--
--   -- 1. Table shape
--   \d+ public.user_preferences
--
--   -- 2. RLS enabled
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'user_preferences';
--   -- expect: t
--
--   -- 3. Policy set
--   SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS check_expr
--     FROM pg_policy
--    WHERE polrelid = 'public.user_preferences'::regclass
--    ORDER BY polname;
--   -- expect rows for: read own prefs (r), write own prefs (a),
--   --                  update own prefs (w), with auth.uid() = user_id.
--
--   -- 4. Smoke-test as the target user (requires a JWT):
--   SELECT auth.uid();  -- should match ben.pazzz@gmail.com's auth.users.id
--   UPDATE user_preferences
--      SET preferences = preferences || '{"home_lat":0,"home_lon":0}'::jsonb,
--          updated_at = now()
--    WHERE user_id = auth.uid()
--    RETURNING user_id, updated_at;
--   -- expect: exactly 1 row returned. If 0 rows, UPDATE policy is still
--   -- blocking — double-check auth.uid() matches user_id.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Table (idempotent) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Guarantee the column set matches what the client writes. These are
-- no-ops if the columns already exist with the right types.
ALTER TABLE public.user_preferences
  ALTER COLUMN preferences SET DEFAULT '{}'::jsonb,
  ALTER COLUMN preferences SET NOT NULL,
  ALTER COLUMN updated_at  SET DEFAULT now(),
  ALTER COLUMN updated_at  SET NOT NULL;

-- 2. Row Level Security ──────────────────────────────────────────────────
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Drop any prior versions of these policies so re-applying this migration
-- leaves a known-good state (including fixing the "USING only" UPDATE
-- variant that triggered the original silent-fail bug).
DROP POLICY IF EXISTS "read own prefs"   ON public.user_preferences;
DROP POLICY IF EXISTS "write own prefs"  ON public.user_preferences;
DROP POLICY IF EXISTS "update own prefs" ON public.user_preferences;
-- Also remove legacy aliases some early Supabase migrations used, so we
-- don't end up with two overlapping UPDATE policies returning different
-- results.
DROP POLICY IF EXISTS "Users can read own preferences"   ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;

-- SELECT — a user can read only their own row.
CREATE POLICY "read own prefs"
  ON public.user_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT — a user can only create their own row (prevents impersonation).
CREATE POLICY "write own prefs"
  ON public.user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE — **the fix**: prior to this migration, upserts were hitting the
-- ON CONFLICT DO UPDATE branch but had no matching UPDATE policy, so the
-- row silently refused to merge. We require BOTH `USING` (who can target
-- this row) and `WITH CHECK` (what values are allowed in the new row) so
-- PostgREST's upsert path succeeds cleanly and returns the updated row.
CREATE POLICY "update own prefs"
  ON public.user_preferences
  FOR UPDATE
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Helper trigger — keep updated_at honest regardless of what the
--    client sends in the payload. Belt-and-suspenders: the client already
--    stamps `updated_at`, but if anyone ever writes via SQL directly we
--    don't want a stale timestamp to fool the last-write-wins merge.
CREATE OR REPLACE FUNCTION public.set_user_preferences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_preferences_set_updated_at ON public.user_preferences;
CREATE TRIGGER user_preferences_set_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_preferences_updated_at();

-- 4. Realtime — AlertContext subscribes via `postgres_changes` to
--    `public.user_preferences`. Make sure the table is in the realtime
--    publication so cross-device sync fires.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'user_preferences'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_preferences';
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- `supabase_realtime` publication doesn't exist in this environment
  -- (e.g. a minimal local Postgres). Skip silently.
  NULL;
END$$;
