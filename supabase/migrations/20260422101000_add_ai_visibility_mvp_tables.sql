BEGIN;

-- 1) Core settings per blog/site
CREATE TABLE IF NOT EXISTS public.ai_visibility_settings (
  blog_id UUID PRIMARY KEY REFERENCES public.blogs(id) ON DELETE CASCADE,
  main_ai_prompt TEXT,
  main_keyword TEXT,
  language_code TEXT NOT NULL DEFAULT 'en',
  location_code INTEGER NOT NULL DEFAULT 2840,
  enabled_models JSONB NOT NULL DEFAULT '{"chat_gpt": true, "gemini": true, "perplexity": true}'::jsonb,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  max_cost_usd NUMERIC(10,2) NOT NULL DEFAULT 5.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Tracked prompts
CREATE TABLE IF NOT EXISTS public.ai_visibility_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blog_id, prompt_text)
);

-- 3) Sync runs
CREATE TABLE IF NOT EXISTS public.ai_visibility_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL DEFAULT 'manual' CHECK (run_type IN ('manual', 'scheduled')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'partial', 'failed', 'stopped_budget', 'paused')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  total_cost_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  error_summary TEXT
);

-- 4) Raw provider payloads
CREATE TABLE IF NOT EXISTS public.ai_visibility_results_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.ai_visibility_runs(id) ON DELETE CASCADE,
  blog_id UUID NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  endpoint_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  task_id TEXT,
  status_code INTEGER,
  cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Normalized mentions
CREATE TABLE IF NOT EXISTS public.ai_visibility_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.ai_visibility_runs(id) ON DELETE CASCADE,
  blog_id UUID NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES public.ai_visibility_prompts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  question TEXT,
  answer_excerpt TEXT,
  position INTEGER,
  source_url TEXT,
  source_domain TEXT,
  detected_brand BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6) Per-model metrics per run
CREATE TABLE IF NOT EXISTS public.ai_visibility_model_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.ai_visibility_runs(id) ON DELETE CASCADE,
  blog_id UUID NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  prompts_total INTEGER NOT NULL DEFAULT 0,
  prompts_with_brand_mention INTEGER NOT NULL DEFAULT 0,
  our_mentions INTEGER NOT NULL DEFAULT 0,
  total_mentions_across_tracked_brands INTEGER NOT NULL DEFAULT 0,
  avg_position NUMERIC(10,2),
  visibility_score NUMERIC(10,4),
  share_of_voice NUMERIC(10,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, provider)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_visibility_prompts_blog_id ON public.ai_visibility_prompts(blog_id);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_runs_blog_id ON public.ai_visibility_runs(blog_id);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_runs_started_at ON public.ai_visibility_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_results_raw_run_id ON public.ai_visibility_results_raw(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_results_raw_blog_id ON public.ai_visibility_results_raw(blog_id);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_mentions_blog_id ON public.ai_visibility_mentions(blog_id);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_mentions_run_id ON public.ai_visibility_mentions(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_mentions_created_at ON public.ai_visibility_mentions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_model_metrics_blog_id ON public.ai_visibility_model_metrics(blog_id);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_model_metrics_run_id ON public.ai_visibility_model_metrics(run_id);

-- Enable RLS
ALTER TABLE public.ai_visibility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_visibility_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_visibility_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_visibility_results_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_visibility_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_visibility_model_metrics ENABLE ROW LEVEL SECURITY;

-- RLS helper expression: user can access rows only for blogs they own
-- We repeat policy definitions for each table.

-- ai_visibility_settings
DROP POLICY IF EXISTS "Users can view own ai visibility settings" ON public.ai_visibility_settings;
CREATE POLICY "Users can view own ai visibility settings"
  ON public.ai_visibility_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_settings.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own ai visibility settings" ON public.ai_visibility_settings;
CREATE POLICY "Users can insert own ai visibility settings"
  ON public.ai_visibility_settings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_settings.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own ai visibility settings" ON public.ai_visibility_settings;
CREATE POLICY "Users can update own ai visibility settings"
  ON public.ai_visibility_settings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_settings.blog_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_settings.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own ai visibility settings" ON public.ai_visibility_settings;
CREATE POLICY "Users can delete own ai visibility settings"
  ON public.ai_visibility_settings FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_settings.blog_id AND b.user_id = auth.uid()));

-- ai_visibility_prompts
DROP POLICY IF EXISTS "Users can view own ai visibility prompts" ON public.ai_visibility_prompts;
CREATE POLICY "Users can view own ai visibility prompts"
  ON public.ai_visibility_prompts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_prompts.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own ai visibility prompts" ON public.ai_visibility_prompts;
CREATE POLICY "Users can insert own ai visibility prompts"
  ON public.ai_visibility_prompts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_prompts.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own ai visibility prompts" ON public.ai_visibility_prompts;
CREATE POLICY "Users can update own ai visibility prompts"
  ON public.ai_visibility_prompts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_prompts.blog_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_prompts.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own ai visibility prompts" ON public.ai_visibility_prompts;
CREATE POLICY "Users can delete own ai visibility prompts"
  ON public.ai_visibility_prompts FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_prompts.blog_id AND b.user_id = auth.uid()));

-- ai_visibility_runs
DROP POLICY IF EXISTS "Users can view own ai visibility runs" ON public.ai_visibility_runs;
CREATE POLICY "Users can view own ai visibility runs"
  ON public.ai_visibility_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_runs.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own ai visibility runs" ON public.ai_visibility_runs;
CREATE POLICY "Users can insert own ai visibility runs"
  ON public.ai_visibility_runs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_runs.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own ai visibility runs" ON public.ai_visibility_runs;
CREATE POLICY "Users can update own ai visibility runs"
  ON public.ai_visibility_runs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_runs.blog_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_runs.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own ai visibility runs" ON public.ai_visibility_runs;
CREATE POLICY "Users can delete own ai visibility runs"
  ON public.ai_visibility_runs FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_runs.blog_id AND b.user_id = auth.uid()));

-- ai_visibility_results_raw
DROP POLICY IF EXISTS "Users can view own ai visibility raw" ON public.ai_visibility_results_raw;
CREATE POLICY "Users can view own ai visibility raw"
  ON public.ai_visibility_results_raw FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_results_raw.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own ai visibility raw" ON public.ai_visibility_results_raw;
CREATE POLICY "Users can insert own ai visibility raw"
  ON public.ai_visibility_results_raw FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_results_raw.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own ai visibility raw" ON public.ai_visibility_results_raw;
CREATE POLICY "Users can update own ai visibility raw"
  ON public.ai_visibility_results_raw FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_results_raw.blog_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_results_raw.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own ai visibility raw" ON public.ai_visibility_results_raw;
CREATE POLICY "Users can delete own ai visibility raw"
  ON public.ai_visibility_results_raw FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_results_raw.blog_id AND b.user_id = auth.uid()));

-- ai_visibility_mentions
DROP POLICY IF EXISTS "Users can view own ai visibility mentions" ON public.ai_visibility_mentions;
CREATE POLICY "Users can view own ai visibility mentions"
  ON public.ai_visibility_mentions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_mentions.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own ai visibility mentions" ON public.ai_visibility_mentions;
CREATE POLICY "Users can insert own ai visibility mentions"
  ON public.ai_visibility_mentions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_mentions.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own ai visibility mentions" ON public.ai_visibility_mentions;
CREATE POLICY "Users can update own ai visibility mentions"
  ON public.ai_visibility_mentions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_mentions.blog_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_mentions.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own ai visibility mentions" ON public.ai_visibility_mentions;
CREATE POLICY "Users can delete own ai visibility mentions"
  ON public.ai_visibility_mentions FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_mentions.blog_id AND b.user_id = auth.uid()));

-- ai_visibility_model_metrics
DROP POLICY IF EXISTS "Users can view own ai visibility model metrics" ON public.ai_visibility_model_metrics;
CREATE POLICY "Users can view own ai visibility model metrics"
  ON public.ai_visibility_model_metrics FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_model_metrics.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own ai visibility model metrics" ON public.ai_visibility_model_metrics;
CREATE POLICY "Users can insert own ai visibility model metrics"
  ON public.ai_visibility_model_metrics FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_model_metrics.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own ai visibility model metrics" ON public.ai_visibility_model_metrics;
CREATE POLICY "Users can update own ai visibility model metrics"
  ON public.ai_visibility_model_metrics FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_model_metrics.blog_id AND b.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_model_metrics.blog_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own ai visibility model metrics" ON public.ai_visibility_model_metrics;
CREATE POLICY "Users can delete own ai visibility model metrics"
  ON public.ai_visibility_model_metrics FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.blogs b WHERE b.id = ai_visibility_model_metrics.blog_id AND b.user_id = auth.uid()));

COMMIT;

