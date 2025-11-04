-- Add scheduling field to blog_posts table
ALTER TABLE blog_posts
ADD COLUMN scheduled_publish_date TIMESTAMPTZ;