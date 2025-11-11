-- Fix search_path for subscription functions
CREATE OR REPLACE FUNCTION can_generate_post(user_uuid UUID, blog_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION can_add_keyword(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION get_user_usage(user_uuid UUID)
RETURNS TABLE (
  posts_count INTEGER,
  keywords_count INTEGER,
  posts_limit INTEGER,
  keywords_limit INTEGER,
  plan_name TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION increment_post_count(user_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_subscription RECORD;
BEGIN
  SELECT * INTO user_subscription FROM subscriptions WHERE user_id = user_uuid AND status = 'active';
  IF user_subscription IS NOT NULL THEN
    UPDATE subscriptions SET posts_generated_count = COALESCE(posts_generated_count, 0) + 1, updated_at = now() WHERE id = user_subscription.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION increment_keyword_count(user_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_subscription RECORD;
BEGIN
  SELECT * INTO user_subscription FROM subscriptions WHERE user_id = user_uuid AND status = 'active';
  IF user_subscription IS NOT NULL THEN
    UPDATE subscriptions SET keywords_count = COALESCE(keywords_count, 0) + 1, updated_at = now() WHERE id = user_subscription.id;
  END IF;
END;
$$;