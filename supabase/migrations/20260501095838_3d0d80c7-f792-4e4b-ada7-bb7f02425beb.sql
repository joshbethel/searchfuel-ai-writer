ALTER TABLE public.ai_visibility_settings
  ADD COLUMN IF NOT EXISTS last_scheduled_sync_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

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