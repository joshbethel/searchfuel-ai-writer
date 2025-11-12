-- Fix RLS policies for blog_posts to allow public access to published posts
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Anyone can view published blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Users can view posts for their blogs" ON public.blog_posts;

-- Create new permissive policy for public access to published posts
CREATE POLICY "Public can view published blog posts"
ON public.blog_posts
FOR SELECT
TO public
USING (status = 'published');

-- Create separate policy for users to view their own posts (any status)
CREATE POLICY "Users can view their own blog posts"
ON public.blog_posts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.blogs
    WHERE blogs.id = blog_posts.blog_id
    AND blogs.user_id = auth.uid()
  )
);