-- Create scheduled_keywords table for calendar scheduling
CREATE TABLE IF NOT EXISTS public.scheduled_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  keyword TEXT NOT NULL,
  scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  post_id UUID REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_keywords ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own scheduled keywords"
  ON public.scheduled_keywords
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create scheduled keywords"
  ON public.scheduled_keywords
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled keywords"
  ON public.scheduled_keywords
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled keywords"
  ON public.scheduled_keywords
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_scheduled_keywords_date ON public.scheduled_keywords(scheduled_date);
CREATE INDEX idx_scheduled_keywords_status ON public.scheduled_keywords(status);
CREATE INDEX idx_scheduled_keywords_blog_id ON public.scheduled_keywords(blog_id);