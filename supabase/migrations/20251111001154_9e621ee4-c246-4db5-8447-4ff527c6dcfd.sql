-- Create subscriptions table for Stripe integration
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid', 'inactive')),
  plan_name TEXT NOT NULL DEFAULT 'free',
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMP WITH TIME ZONE,
  posts_generated_count INTEGER DEFAULT 0,
  keywords_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Subscription usage checking functions
CREATE OR REPLACE FUNCTION can_generate_post(user_uuid UUID, blog_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_subscription RECORD;
  max_posts INTEGER;
  blog_owner_id UUID;
  current_period_start TIMESTAMP WITH TIME ZONE;
  current_period_end TIMESTAMP WITH TIME ZONE;
  period_posts_count INTEGER;
BEGIN
  SELECT user_id INTO blog_owner_id FROM blogs WHERE id = blog_uuid;
  IF blog_owner_id IS NULL OR blog_owner_id != user_uuid THEN RETURN false; END IF;
  
  SELECT * INTO user_subscription FROM subscriptions WHERE user_id = user_uuid AND status = 'active';
  
  IF user_subscription IS NULL THEN
    current_period_start := date_trunc('month', CURRENT_DATE);
    current_period_end := date_trunc('month', CURRENT_DATE) + interval '1 month';
    SELECT COUNT(*)::INTEGER INTO period_posts_count FROM blog_posts bp JOIN blogs b ON bp.blog_id = b.id WHERE b.user_id = user_uuid AND bp.created_at >= current_period_start AND bp.created_at < current_period_end;
    max_posts := 3;
  ELSE
    current_period_start := user_subscription.current_period_start;
    current_period_end := user_subscription.current_period_end;
    IF current_period_start IS NULL OR current_period_start < date_trunc('month', CURRENT_DATE) THEN
      current_period_start := date_trunc('month', CURRENT_DATE);
      current_period_end := date_trunc('month', CURRENT_DATE) + interval '1 month';
      SELECT COUNT(*)::INTEGER INTO period_posts_count FROM blog_posts bp JOIN blogs b ON bp.blog_id = b.id WHERE b.user_id = user_uuid AND bp.created_at >= current_period_start AND bp.created_at < current_period_end;
    ELSE
      period_posts_count := COALESCE(user_subscription.posts_generated_count, 0);
    END IF;
    max_posts := CASE WHEN user_subscription.plan_name = 'pro' THEN 40 ELSE 3 END;
  END IF;
  
  RETURN period_posts_count < max_posts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION can_add_keyword(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_subscription RECORD;
  max_keywords INTEGER;
  current_keywords_count INTEGER;
BEGIN
  SELECT * INTO user_subscription FROM subscriptions WHERE user_id = user_uuid AND status = 'active';
  
  IF user_subscription IS NULL THEN
    SELECT COUNT(*)::INTEGER INTO current_keywords_count FROM keywords WHERE user_id = user_uuid;
    max_keywords := 10;
  ELSE
    current_keywords_count := COALESCE(user_subscription.keywords_count, 0);
    max_keywords := CASE WHEN user_subscription.plan_name = 'pro' THEN 100 ELSE 10 END;
  END IF;
  
  RETURN current_keywords_count < max_keywords;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_usage(user_uuid UUID)
RETURNS TABLE (
  posts_count INTEGER,
  keywords_count INTEGER,
  posts_limit INTEGER,
  keywords_limit INTEGER,
  plan_name TEXT,
  status TEXT
) AS $$
DECLARE
  user_subscription RECORD;
  period_start TIMESTAMP WITH TIME ZONE;
  period_end TIMESTAMP WITH TIME ZONE;
  actual_posts_count INTEGER;
BEGIN
  SELECT * INTO user_subscription FROM subscriptions WHERE user_id = user_uuid AND status = 'active';
  
  IF user_subscription IS NULL THEN
    period_start := date_trunc('month', CURRENT_DATE);
    period_end := date_trunc('month', CURRENT_DATE) + interval '1 month';
    SELECT COUNT(*)::INTEGER INTO actual_posts_count FROM blog_posts bp JOIN blogs b ON bp.blog_id = b.id WHERE b.user_id = user_uuid AND bp.created_at >= period_start AND bp.created_at < period_end;
    SELECT COUNT(*)::INTEGER INTO keywords_count FROM keywords WHERE user_id = user_uuid;
    RETURN QUERY SELECT actual_posts_count, keywords_count, 3::INTEGER, 10::INTEGER, 'free'::TEXT, 'inactive'::TEXT;
  ELSE
    period_start := COALESCE(user_subscription.current_period_start, date_trunc('month', CURRENT_DATE));
    period_end := COALESCE(user_subscription.current_period_end, date_trunc('month', CURRENT_DATE) + interval '1 month');
    IF user_subscription.current_period_start IS NULL OR user_subscription.current_period_start < date_trunc('month', CURRENT_DATE) THEN
      SELECT COUNT(*)::INTEGER INTO actual_posts_count FROM blog_posts bp JOIN blogs b ON bp.blog_id = b.id WHERE b.user_id = user_uuid AND bp.created_at >= date_trunc('month', CURRENT_DATE) AND bp.created_at < date_trunc('month', CURRENT_DATE) + interval '1 month';
    ELSE
      actual_posts_count := COALESCE(user_subscription.posts_generated_count, 0);
    END IF;
    RETURN QUERY SELECT actual_posts_count, COALESCE(user_subscription.keywords_count, 0), CASE WHEN user_subscription.plan_name = 'pro' THEN 40 ELSE 3 END::INTEGER, CASE WHEN user_subscription.plan_name = 'pro' THEN 100 ELSE 10 END::INTEGER, user_subscription.plan_name, user_subscription.status;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_post_count(user_uuid UUID)
RETURNS VOID AS $$
DECLARE
  user_subscription RECORD;
BEGIN
  SELECT * INTO user_subscription FROM subscriptions WHERE user_id = user_uuid AND status = 'active';
  IF user_subscription IS NOT NULL THEN
    UPDATE subscriptions SET posts_generated_count = COALESCE(posts_generated_count, 0) + 1, updated_at = now() WHERE id = user_subscription.id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_keyword_count(user_uuid UUID)
RETURNS VOID AS $$
DECLARE
  user_subscription RECORD;
BEGIN
  SELECT * INTO user_subscription FROM subscriptions WHERE user_id = user_uuid AND status = 'active';
  IF user_subscription IS NOT NULL THEN
    UPDATE subscriptions SET keywords_count = COALESCE(keywords_count, 0) + 1, updated_at = now() WHERE id = user_subscription.id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;