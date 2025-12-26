-- Add competitor analysis and content scoring columns to blog_posts
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS competitor_analysis JSONB,
  ADD COLUMN IF NOT EXISTS content_score FLOAT,
  ADD COLUMN IF NOT EXISTS content_score_factors JSONB,
  ADD COLUMN IF NOT EXISTS competitor_analysis_at TIMESTAMPTZ;

-- Add index for content score queries
CREATE INDEX IF NOT EXISTS idx_blog_posts_content_score 
  ON blog_posts(content_score) 
  WHERE content_score IS NOT NULL;

-- Add index for competitor analysis queries
CREATE INDEX IF NOT EXISTS idx_blog_posts_competitor_analysis 
  ON blog_posts USING GIN (competitor_analysis) 
  WHERE competitor_analysis IS NOT NULL;