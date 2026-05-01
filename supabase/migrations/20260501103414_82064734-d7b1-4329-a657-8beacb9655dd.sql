ALTER TABLE public.ai_visibility_settings
ADD COLUMN IF NOT EXISTS weekly_sync_enabled boolean NOT NULL DEFAULT true;