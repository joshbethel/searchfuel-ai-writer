-- Create blogs table for user blog management
CREATE TABLE public.blogs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subdomain TEXT NOT NULL UNIQUE,
  custom_domain TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create blog_analytics table for tracking metrics
CREATE TABLE public.blog_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blog_id UUID NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  bounce_rate DECIMAL(5,2),
  avg_time_on_page INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(blog_id, date)
);

-- Enable RLS
ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for blogs
CREATE POLICY "Users can view their own blogs"
  ON public.blogs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own blogs"
  ON public.blogs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own blogs"
  ON public.blogs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own blogs"
  ON public.blogs FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for blog_analytics
CREATE POLICY "Users can view analytics for their blogs"
  ON public.blog_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.blogs
      WHERE blogs.id = blog_analytics.blog_id
      AND blogs.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert analytics"
  ON public.blog_analytics FOR INSERT
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_blogs_updated_at
  BEFORE UPDATE ON public.blogs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for performance
CREATE INDEX idx_blog_analytics_blog_date ON public.blog_analytics(blog_id, date DESC);