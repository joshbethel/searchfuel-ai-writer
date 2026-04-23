ALTER TABLE public.ai_visibility_settings
ALTER COLUMN max_cost_usd SET DEFAULT 1.00;

ALTER TABLE public.ai_visibility_admin_policy
ALTER COLUMN max_cost_usd SET DEFAULT 1.00;
