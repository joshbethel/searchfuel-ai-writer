-- Fix publishing_status check constraint to include 'scheduled'
-- The original constraint was created without 'scheduled', and ADD COLUMN IF NOT EXISTS
-- doesn't update existing constraints, so we need to drop and recreate it

-- Drop the old constraint if it exists
ALTER TABLE public.blog_posts 
DROP CONSTRAINT IF EXISTS blog_posts_publishing_status_check;

-- Add the updated constraint with 'scheduled' included
ALTER TABLE public.blog_posts 
ADD CONSTRAINT blog_posts_publishing_status_check 
CHECK (publishing_status IN ('pending', 'scheduled', 'publishing', 'published', 'failed'));