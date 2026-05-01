-- Add last_scheduled_sync_at to ai_visibility_settings so the dashboard
-- can display when the last automated run completed.
ALTER TABLE public.ai_visibility_settings
  ADD COLUMN IF NOT EXISTS last_scheduled_sync_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Enable pg_cron and pg_net extensions (no-ops if already enabled).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule weekly AI visibility sync: every Monday at 03:00 UTC.
-- Calls the ai-visibility-scheduled-sync edge function which iterates all
-- non-paused sites and runs a full sync with run_type = 'scheduled'.
--
-- To update the URL below, replace the project ref (qihpywleopgrlvwcffvy)
-- with the correct Supabase project ref for your environment.
SELECT cron.schedule(
  'ai-visibility-weekly-sync',
  '0 3 * * 1',
  $$
  SELECT net.http_post(
    url    := 'https://qihpywleopgrlvwcffvy.supabase.co/functions/v1/ai-visibility-scheduled-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body   := '{}'::jsonb
  ) AS request_id;
  $$
);
