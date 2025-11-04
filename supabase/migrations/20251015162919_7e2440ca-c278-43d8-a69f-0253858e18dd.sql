-- Add article_types column to blogs table with all types enabled by default
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS article_types JSONB DEFAULT '{"listicle": true, "how_to": true, "checklist": true, "qa": true, "versus": true, "roundup": true, "news": true, "interactive_tool": true, "advertorial": true}'::jsonb;

-- Add article_type column to blog_posts table to track which type each post is
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS article_type TEXT;

-- Update existing blogs to have default article types
UPDATE blogs SET article_types = '{"listicle": true, "how_to": true, "checklist": true, "qa": true, "versus": true, "roundup": true, "news": true, "interactive_tool": true, "advertorial": true}'::jsonb
WHERE article_types IS NULL;