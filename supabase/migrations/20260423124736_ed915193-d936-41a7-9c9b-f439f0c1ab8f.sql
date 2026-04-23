ALTER TABLE public.ai_visibility_runs
ADD COLUMN IF NOT EXISTS effective_language_code TEXT,
ADD COLUMN IF NOT EXISTS effective_location_code INTEGER;