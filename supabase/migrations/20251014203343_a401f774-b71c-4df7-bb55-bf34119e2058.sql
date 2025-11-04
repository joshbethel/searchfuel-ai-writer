-- Add backlink configuration columns to blogs table
ALTER TABLE blogs
ADD COLUMN IF NOT EXISTS target_pages jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS backlink_strategy text DEFAULT 'smart_contextual',
ADD COLUMN IF NOT EXISTS max_links_per_post integer DEFAULT 5;

-- Add comment for documentation
COMMENT ON COLUMN blogs.target_pages IS 'Array of target pages for backlinking with URLs, keywords, and priority';
COMMENT ON COLUMN blogs.backlink_strategy IS 'Strategy for backlink insertion: homepage_only, smart_contextual, or service_pages';
COMMENT ON COLUMN blogs.max_links_per_post IS 'Maximum number of automatic backlinks to insert per post';