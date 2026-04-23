-- Add global enabled model controls for AI visibility policy.
ALTER TABLE public.ai_visibility_admin_policy
ADD COLUMN IF NOT EXISTS enabled_models JSONB NOT NULL DEFAULT '{"chat_gpt": true, "gemini": true, "perplexity": true}'::jsonb;

UPDATE public.ai_visibility_admin_policy
SET enabled_models = COALESCE(
  enabled_models,
  '{"chat_gpt": true, "gemini": true, "perplexity": true}'::jsonb
)
WHERE id = TRUE;
