-- Remove free plan fallback and require active subscription
-- This migration enforces that all features require an active Pro subscription

-- Update can_generate_post to require active subscription (no free plan fallback)
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
  -- Verify blog ownership (CRITICAL for security)
  SELECT user_id INTO blog_owner_id FROM blogs WHERE id = blog_uuid;
  IF blog_owner_id IS NULL OR blog_owner_id != user_uuid THEN RETURN false; END IF;
  
  -- Get active subscription - REQUIRED (no free plan fallback)
  SELECT * INTO user_subscription 
  FROM subscriptions 
  WHERE user_id = user_uuid 
    AND status = 'active'
    AND plan_name IS NOT NULL
    AND plan_name != 'free';
  
  -- If no active subscription, deny access
  IF user_subscription IS NULL THEN
    RETURN false;
  END IF;
  
  -- Calculate period and count posts
  current_period_start := COALESCE(user_subscription.current_period_start, date_trunc('month', CURRENT_DATE));
  current_period_end := COALESCE(user_subscription.current_period_end, date_trunc('month', CURRENT_DATE) + interval '1 month');
  
  IF current_period_start IS NULL OR current_period_start < date_trunc('month', CURRENT_DATE) THEN
    current_period_start := date_trunc('month', CURRENT_DATE);
    current_period_end := date_trunc('month', CURRENT_DATE) + interval '1 month';
    SELECT COUNT(*)::INTEGER INTO period_posts_count 
    FROM blog_posts bp 
    JOIN blogs b ON bp.blog_id = b.id 
    WHERE b.user_id = user_uuid 
      AND bp.created_at >= current_period_start 
      AND bp.created_at < current_period_end;
  ELSE
    period_posts_count := COALESCE(user_subscription.posts_generated_count, 0);
  END IF;
  
  -- Set limit based on plan (Pro = 20, others can be added later)
  max_posts := CASE WHEN user_subscription.plan_name = 'pro' THEN 20 ELSE 0 END;
  
  RETURN period_posts_count < max_posts;
END;
$$;

-- Update can_add_keyword to require active subscription (no free plan fallback)
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
  -- Get active subscription - REQUIRED (no free plan fallback)
  SELECT * INTO user_subscription 
  FROM subscriptions 
  WHERE user_id = user_uuid 
    AND status = 'active'
    AND plan_name IS NOT NULL
    AND plan_name != 'free';
  
  -- If no active subscription, deny access
  IF user_subscription IS NULL THEN
    RETURN false;
  END IF;
  
  -- Use stored count from subscriptions table
  current_keywords_count := COALESCE(user_subscription.keywords_count, 0);
  
  -- Set limit based on plan (Pro = 100, others can be added later)
  max_keywords := CASE WHEN user_subscription.plan_name = 'pro' THEN 100 ELSE 0 END;
  
  RETURN current_keywords_count < max_keywords;
END;
$$;

-- Update get_user_usage to only return data for active subscriptions
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
  -- Get active subscription - REQUIRED
  SELECT * INTO user_subscription
  FROM subscriptions
  WHERE user_id = user_uuid
    AND status = 'active'
    AND plan_name IS NOT NULL
    AND plan_name != 'free';
  
  -- If no active subscription, return empty result
  IF user_subscription IS NULL THEN
    RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::TEXT, 'inactive'::TEXT;
    RETURN;
  END IF;
  
  -- Calculate usage for active subscription
  period_start := COALESCE(user_subscription.current_period_start, date_trunc('month', CURRENT_DATE));
  period_end := COALESCE(user_subscription.current_period_end, date_trunc('month', CURRENT_DATE) + interval '1 month');
  
  IF user_subscription.current_period_start IS NULL OR user_subscription.current_period_start < date_trunc('month', CURRENT_DATE) THEN
    SELECT COUNT(*)::INTEGER INTO actual_posts_count
    FROM blog_posts bp
    JOIN blogs b ON bp.blog_id = b.id
    WHERE b.user_id = user_uuid
      AND bp.created_at >= date_trunc('month', CURRENT_DATE)
      AND bp.created_at < date_trunc('month', CURRENT_DATE) + interval '1 month';
  ELSE
    actual_posts_count := COALESCE(user_subscription.posts_generated_count, 0);
  END IF;
  
  RETURN QUERY SELECT
    actual_posts_count,
    COALESCE(user_subscription.keywords_count, 0),
    CASE WHEN user_subscription.plan_name = 'pro' THEN 20 ELSE 0 END::INTEGER,
    CASE WHEN user_subscription.plan_name = 'pro' THEN 100 ELSE 0 END::INTEGER,
    user_subscription.plan_name,
    user_subscription.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

