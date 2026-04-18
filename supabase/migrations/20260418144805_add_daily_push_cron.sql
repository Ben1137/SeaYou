-- ─────────────────────────────────────────────────────────────────────────
-- Migration: add_daily_push_cron
-- Schedules the `daily-surf-report` Edge Function to run every day at
-- 06:00 UTC. The Edge Function is responsible for scoring each user's home
-- spot against their persona and pushing a OneSignal notification when a
-- "Good" or better window (score >= 75) appears in the day's forecast.
--
-- Requires the `pg_cron` and `pg_net` extensions, both shipped with
-- Supabase (pg_net gives Postgres outbound HTTP capability, pg_cron gives
-- us a scheduler).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Extensions — safe to re-run; both are usually already enabled on
--    Supabase projects, but we assert them here for migration portability.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Remove any previously-registered job under the same name so that
--    re-running this migration updates the schedule cleanly.
SELECT cron.unschedule('daily-surf-report')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-surf-report'
);

-- 3. Register the job.
--    Cron expression: `0 6 * * *` — minute 0, hour 6, every day (UTC).
--    Replace the placeholders below before applying to a real project:
--      [YOUR_PROJECT_REF] — e.g. `mxuvijlowneokmzeompn`
--      [ANON_KEY]         — your `anon` public key (or service_role key if
--                          the function is configured to require it)
SELECT cron.schedule(
  'daily-surf-report',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://[YOUR_PROJECT_REF].supabase.co/functions/v1/daily-surf-report',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer [ANON_KEY]"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- ─────────────────────────────────────────────────────────────────────────
-- Verification helpers (run manually, not part of migration apply):
--
--   -- See the scheduled job and its next run time
--   SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'daily-surf-report';
--
--   -- See recent runs and HTTP status codes
--   SELECT * FROM cron.job_run_details
--    WHERE jobname = 'daily-surf-report'
--    ORDER BY start_time DESC LIMIT 10;
--
--   -- Manually trigger the function right now (for smoke-testing)
--   SELECT net.http_post(
--     url := 'https://[YOUR_PROJECT_REF].supabase.co/functions/v1/daily-surf-report',
--     headers := '{"Authorization": "Bearer [ANON_KEY]"}'::jsonb
--   );
-- ─────────────────────────────────────────────────────────────────────────
