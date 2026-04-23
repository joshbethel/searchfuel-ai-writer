-- Migration: Set AI Visibility default budget to $1.00
-- Changes the default max_cost_usd from $5.00 to $1.00 for both user settings and admin policy

ALTER TABLE public.ai_visibility_settings
ALTER COLUMN max_cost_usd SET DEFAULT 1.00;

ALTER TABLE public.ai_visibility_admin_policy
ALTER COLUMN max_cost_usd SET DEFAULT 1.00;

-- Update existing rows that have the old default of 5.00 to the new default of 1.00
-- Only update rows that still have the exact old default value
UPDATE public.ai_visibility_settings
SET max_cost_usd = 1.00
WHERE max_cost_usd = 5.00;

UPDATE public.ai_visibility_admin_policy
SET max_cost_usd = 1.00
WHERE max_cost_usd = 5.00 AND id = true;

-- Also update the enabled_models default to ensure all providers are enabled by default
ALTER TABLE public.ai_visibility_admin_policy
ALTER COLUMN enabled_models SET DEFAULT '{"chat_gpt": true, "gemini": true, "perplexity": true}'::jsonb;

ALTER TABLE public.ai_visibility_settings
ALTER COLUMN enabled_models SET DEFAULT '{"chat_gpt": true, "gemini": true, "perplexity": true}'::jsonb;

-- Update the frontend code to use $1.00 as default
-- This is handled in the application code (BlogOnboarding.tsx, AiVisibilitySettings.tsx, AiVisibilityAdminControls.tsx)
-- The edge function ai-visibility-sync/index.ts also uses DEFAULT_MAX_COST_USD = 1

-- Add comment to document the change
COMMENT ON TABLE public.ai_visibility_settings IS 'AI Visibility user settings with $1.00 default budget';
COMMENT ON TABLE public.ai_visibility_admin_policy IS 'AI Visibility global admin policy with $1.00 default max budget';

-- Verify the changes
SELECT 
  'ai_visibility_settings' as table_name,
  column_name,
  column_default
FROM information_schema.columns
WHERE table_name = 'ai_visibility_settings' AND column_name = 'max_cost_usd'
UNION ALL
SELECT 
  'ai_visibility_admin_policy' as table_name,
  column_name,
  column_default
FROM information_schema.columns
WHERE table_name = 'ai_visibility_admin_policy' AND column_name = 'max_cost_usd';