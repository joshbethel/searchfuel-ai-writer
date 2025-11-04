-- Add publishing status fields to blog_posts
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS publishing_status TEXT DEFAULT 'pending'
  CHECK (publishing_status IN ('pending', 'scheduled', 'publishing', 'published', 'failed'));

ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS external_post_id TEXT;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS external_post_url TEXT;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_blog_posts_publishing_status ON public.blog_posts(publishing_status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_scheduled_for ON public.blog_posts(scheduled_for)
  WHERE scheduled_for IS NOT NULL;