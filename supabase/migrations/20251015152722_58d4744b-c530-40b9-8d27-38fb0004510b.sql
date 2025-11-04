-- Add post_id to blog_analytics for tracking per-post analytics
ALTER TABLE public.blog_analytics 
ADD COLUMN post_id uuid REFERENCES public.blog_posts(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX idx_blog_analytics_post_id ON public.blog_analytics(post_id);
CREATE INDEX idx_blog_analytics_blog_post_date ON public.blog_analytics(blog_id, post_id, date);

-- Add ranking data to keywords table
ALTER TABLE public.keywords 
ADD COLUMN ranking_position integer,
ADD COLUMN last_rank_check timestamp with time zone;

-- Create index for ranking queries
CREATE INDEX idx_keywords_ranking ON public.keywords(user_id, ranking_position) WHERE ranking_position IS NOT NULL;