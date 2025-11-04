-- Add publishing status fields to articles
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS publishing_status TEXT DEFAULT 'pending'
  CHECK (publishing_status IN ('pending', 'scheduled', 'publishing', 'published', 'failed'));

ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS external_post_id TEXT;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS external_post_url TEXT;

-- Create an index for faster status queries
CREATE INDEX IF NOT EXISTS idx_articles_publishing_status ON public.articles(publishing_status);
CREATE INDEX IF NOT EXISTS idx_articles_scheduled_for ON public.articles(scheduled_for)
  WHERE scheduled_for IS NOT NULL;