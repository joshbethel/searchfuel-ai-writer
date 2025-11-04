-- Add external CMS tracking fields to blog_posts
ALTER TABLE blog_posts 
ADD COLUMN IF NOT EXISTS external_post_id TEXT,
ADD COLUMN IF NOT EXISTS publishing_status TEXT DEFAULT 'pending' CHECK (publishing_status IN ('pending', 'publishing', 'published', 'failed')),
ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_blog_posts_publishing_status ON blog_posts(publishing_status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_external_id ON blog_posts(external_post_id);