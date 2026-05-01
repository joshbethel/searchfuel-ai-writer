ALTER TABLE public.ai_visibility_admin_policy
ADD COLUMN IF NOT EXISTS weekly_sync_enabled BOOLEAN NOT NULL DEFAULT true;