-- Step 1: Drop the existing constraint
ALTER TABLE public.admin_actions
DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;

-- Step 2: Update any non-conforming rows to 'update_user_content'
UPDATE public.admin_actions
SET action_type = 'update_user_content'
WHERE action_type NOT IN (
  'grant_pro_access',
  'revoke_pro_access',
  'update_user_content',
  'delete_user_content',
  'update_ai_visibility_budget_policy',
  'update_ai_visibility_models_policy'
);

-- Step 3: Recreate the constraint with the new allowed values
ALTER TABLE public.admin_actions
ADD CONSTRAINT admin_actions_action_type_check
CHECK (action_type IN (
  'grant_pro_access',
  'revoke_pro_access',
  'update_user_content',
  'delete_user_content',
  'update_ai_visibility_budget_policy',
  'update_ai_visibility_models_policy'
));

-- Migration: 20260423113000_add_ai_visibility_policy_enabled_models.sql
-- Add enabled_models JSONB column to ai_visibility_admin_policy
ALTER TABLE public.ai_visibility_admin_policy
ADD COLUMN IF NOT EXISTS enabled_models JSONB NOT NULL DEFAULT '{"chat_gpt": true, "gemini": true, "perplexity": true}'::jsonb;

COMMENT ON COLUMN public.ai_visibility_admin_policy.enabled_models IS 'JSON object tracking which AI providers are enabled globally (chat_gpt, gemini, perplexity)';