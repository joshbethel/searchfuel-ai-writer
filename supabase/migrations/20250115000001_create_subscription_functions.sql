-- SQL Functions for Subscription Usage Checking

-- Function to check if user can generate a post
-- IMPORTANT: Also verifies blog ownership for security
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
  -- Verify blog ownership (CRITICAL for security)
  SELECT user_id INTO blog_owner_id
  FROM blogs
  WHERE id = blog_uuid;
  
  IF blog_owner_id IS NULL OR blog_owner_id != user_uuid THEN
    RETURN false; -- Blog doesn't exist or doesn't belong to user
  END IF;
  
  -- Get user's subscription (default to free if no subscription)
  SELECT * INTO user_subscription
  FROM subscriptions
  WHERE user_id = user_uuid
  AND status = 'active';
  
  -- If no active subscription, use free plan defaults
  IF user_subscription IS NULL THEN
    -- Check if we're in a new period (calendar month for free users)
    current_period_start := date_trunc('month', CURRENT_DATE);
    current_period_end := date_trunc('month', CURRENT_DATE) + interval '1 month';
    
    -- Count posts in current calendar month
    SELECT COUNT(*)::INTEGER INTO period_posts_count
    FROM blog_posts bp
    JOIN blogs b ON bp.blog_id = b.id
    WHERE b.user_id = user_uuid
    AND bp.created_at >= current_period_start
    AND bp.created_at < current_period_end;
    
    -- Free plan limit
    max_posts := 3;
  ELSE
    -- Use subscription period and stored count
    current_period_start := user_subscription.current_period_start;
    current_period_end := user_subscription.current_period_end;
    
    -- Check if we're in a new period (reset needed)
    IF current_period_start IS NULL OR 
       current_period_start < date_trunc('month', CURRENT_DATE) THEN
      -- Period reset needed - count from start of current month
      current_period_start := date_trunc('month', CURRENT_DATE);
      current_period_end := date_trunc('month', CURRENT_DATE) + interval '1 month';
      
      SELECT COUNT(*)::INTEGER INTO period_posts_count
      FROM blog_posts bp
      JOIN blogs b ON bp.blog_id = b.id
      WHERE b.user_id = user_uuid
      AND bp.created_at >= current_period_start
      AND bp.created_at < current_period_end;
    ELSE
      -- Use stored count (from subscriptions table)
      period_posts_count := COALESCE(user_subscription.posts_generated_count, 0);
    END IF;
    
    -- Get limit based on plan
    IF user_subscription.plan_name = 'pro' THEN
      max_posts := 40;
    ELSE
      max_posts := 3;
    END IF;
  END IF;
  
  -- Check if under limit
  RETURN period_posts_count < max_posts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can add a keyword
CREATE OR REPLACE FUNCTION can_add_keyword(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_subscription RECORD;
  max_keywords INTEGER;
  current_keywords_count INTEGER;
BEGIN
  -- Get user's subscription (default to free if no subscription)
  SELECT * INTO user_subscription
  FROM subscriptions
  WHERE user_id = user_uuid
  AND status = 'active';
  
  -- If no active subscription, use free plan defaults
  IF user_subscription IS NULL THEN
    -- Count total keywords for free user
    SELECT COUNT(*)::INTEGER INTO current_keywords_count
    FROM keywords
    WHERE user_id = user_uuid;
    
    -- Free plan limit
    max_keywords := 10;
  ELSE
    -- Use stored count from subscriptions table
    current_keywords_count := COALESCE(user_subscription.keywords_count, 0);
    
    -- Get limit based on plan
    IF user_subscription.plan_name = 'pro' THEN
      max_keywords := 100;
    ELSE
      max_keywords := 10;
    END IF;
  END IF;
  
  -- Check if under limit
  RETURN current_keywords_count < max_keywords;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's current usage
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
  -- Get user's subscription
  SELECT * INTO user_subscription
  FROM subscriptions
  WHERE user_id = user_uuid
  AND status = 'active';
  
  -- If no active subscription, use free plan defaults
  IF user_subscription IS NULL THEN
    period_start := date_trunc('month', CURRENT_DATE);
    period_end := date_trunc('month', CURRENT_DATE) + interval '1 month';
    
    -- Count posts in current calendar month
    SELECT COUNT(*)::INTEGER INTO actual_posts_count
    FROM blog_posts bp
    JOIN blogs b ON bp.blog_id = b.id
    WHERE b.user_id = user_uuid
    AND bp.created_at >= period_start
    AND bp.created_at < period_end;
    
    -- Count total keywords
    SELECT COUNT(*)::INTEGER INTO keywords_count
    FROM keywords
    WHERE user_id = user_uuid;
    
    RETURN QUERY SELECT
      actual_posts_count,
      keywords_count,
      3::INTEGER, -- free plan posts limit
      10::INTEGER, -- free plan keywords limit
      'free'::TEXT,
      'inactive'::TEXT;
  ELSE
    -- Use subscription period
    period_start := COALESCE(user_subscription.current_period_start, date_trunc('month', CURRENT_DATE));
    period_end := COALESCE(user_subscription.current_period_end, date_trunc('month', CURRENT_DATE) + interval '1 month');
    
    -- Use stored count or calculate if period changed
    IF user_subscription.current_period_start IS NULL OR 
       user_subscription.current_period_start < date_trunc('month', CURRENT_DATE) THEN
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
      CASE WHEN user_subscription.plan_name = 'pro' THEN 40 ELSE 3 END::INTEGER,
      CASE WHEN user_subscription.plan_name = 'pro' THEN 100 ELSE 10 END::INTEGER,
      user_subscription.plan_name,
      user_subscription.status;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment post count for a user
CREATE OR REPLACE FUNCTION increment_post_count(user_uuid UUID)
RETURNS VOID AS $$
DECLARE
  user_subscription RECORD;
BEGIN
  -- Get user's active subscription
  SELECT * INTO user_subscription
  FROM subscriptions
  WHERE user_id = user_uuid
  AND status = 'active';
  
  IF user_subscription IS NOT NULL THEN
    -- Increment count for subscribed user
    UPDATE subscriptions
    SET posts_generated_count = COALESCE(posts_generated_count, 0) + 1,
        updated_at = now()
    WHERE id = user_subscription.id;
  END IF;
  -- For free users, the count is tracked in can_generate_post function
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment keyword count for a user
CREATE OR REPLACE FUNCTION increment_keyword_count(user_uuid UUID)
RETURNS VOID AS $$
DECLARE
  user_subscription RECORD;
BEGIN
  -- Get user's active subscription
  SELECT * INTO user_subscription
  FROM subscriptions
  WHERE user_id = user_uuid
  AND status = 'active';
  
  IF user_subscription IS NOT NULL THEN
    -- Increment count for subscribed user
    UPDATE subscriptions
    SET keywords_count = COALESCE(keywords_count, 0) + 1,
        updated_at = now()
    WHERE id = user_subscription.id;
  END IF;
  -- For free users, the count is tracked directly in keywords table
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

