-- Add onboarding fields to blogs table
ALTER TABLE public.blogs
ADD COLUMN company_name TEXT,
ADD COLUMN website_homepage TEXT,
ADD COLUMN website_cta TEXT,
ADD COLUMN industry TEXT,
ADD COLUMN company_description TEXT,
ADD COLUMN target_audience TEXT,
ADD COLUMN competitors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN theme TEXT DEFAULT 'bold-gradient',
ADD COLUMN onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN auto_post_enabled BOOLEAN DEFAULT true,
ADD COLUMN last_post_generated_at TIMESTAMP WITH TIME ZONE;

-- Create blog_posts table for AI-generated content
CREATE TABLE public.blog_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blog_id UUID NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  featured_image TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(blog_id, slug)
);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for blog_posts
CREATE POLICY "Users can view posts for their blogs"
  ON public.blog_posts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.blogs
      WHERE blogs.id = blog_posts.blog_id
      AND blogs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create posts for their blogs"
  ON public.blog_posts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.blogs
      WHERE blogs.id = blog_posts.blog_id
      AND blogs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update posts for their blogs"
  ON public.blog_posts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.blogs
      WHERE blogs.id = blog_posts.blog_id
      AND blogs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete posts for their blogs"
  ON public.blog_posts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.blogs
      WHERE blogs.id = blog_posts.blog_id
      AND blogs.user_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for performance
CREATE INDEX idx_blog_posts_blog_id ON public.blog_posts(blog_id);
CREATE INDEX idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX idx_blog_posts_published_at ON public.blog_posts(published_at DESC);