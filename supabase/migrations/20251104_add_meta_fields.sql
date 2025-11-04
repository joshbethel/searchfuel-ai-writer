-- Add meta fields to blog_posts table
ALTER TABLE blog_posts
ADD COLUMN meta_title TEXT,
ADD COLUMN meta_description TEXT;