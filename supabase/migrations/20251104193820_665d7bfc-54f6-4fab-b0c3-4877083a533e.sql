-- Add SEO metadata columns to blog_posts table
ALTER TABLE public.blog_posts 
ADD COLUMN meta_title TEXT,
ADD COLUMN meta_description TEXT;