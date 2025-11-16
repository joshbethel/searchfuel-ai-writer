-- Update pro plan post limit from 40 to 20 in database functions
CREATE OR REPLACE FUNCTION public.can_generate_post(user_uuid uuid, blog_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  
  SELECT * INTO user_subscription FROM subscriptions WHERE user_id = user_uuid AND status IN ('active', 'trialing');
  
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
    max_posts := CASE WHEN user_subscription.plan_name = 'pro' THEN 20 ELSE 3 END;
  END IF;
  
  RETURN period_posts_count < max_posts;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_usage(user_uuid uuid)
RETURNS TABLE(posts_count integer, keywords_count integer, posts_limit integer, keywords_limit integer, plan_name text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_subscription RECORD;
  period_start TIMESTAMP WITH TIME ZONE;
  period_end TIMESTAMP WITH TIME ZONE;
  actual_posts_count INTEGER;
BEGIN
  SELECT * INTO user_subscription FROM subscriptions WHERE user_id = user_uuid AND status IN ('active', 'trialing');
  
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
    RETURN QUERY SELECT actual_posts_count, COALESCE(user_subscription.keywords_count, 0), CASE WHEN user_subscription.plan_name = 'pro' THEN 20 ELSE 3 END::INTEGER, CASE WHEN user_subscription.plan_name = 'pro' THEN 100 ELSE 10 END::INTEGER, user_subscription.plan_name, user_subscription.status;
  END IF;
END;
$function$;