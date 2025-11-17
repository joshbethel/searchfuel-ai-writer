-- Fix increment_post_count to also handle 'trialing' status
-- and add better error handling

CREATE OR REPLACE FUNCTION increment_post_count(user_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_subscription RECORD;
BEGIN
  -- Get user's active or trialing subscription
  SELECT * INTO user_subscription
  FROM subscriptions
  WHERE user_id = user_uuid
    AND status IN ('active', 'trialing')
    AND plan_name IS NOT NULL
    AND plan_name != 'free';
  
  IF user_subscription IS NOT NULL THEN
    -- Increment count for subscribed user
    UPDATE subscriptions
    SET posts_generated_count = COALESCE(posts_generated_count, 0) + 1,
        updated_at = now()
    WHERE id = user_subscription.id;
    
    -- Log the increment (for debugging - remove in production if needed)
    RAISE NOTICE 'Incremented post count for user %: % -> %', 
      user_uuid, 
      COALESCE(user_subscription.posts_generated_count, 0),
      COALESCE(user_subscription.posts_generated_count, 0) + 1;
  ELSE
    -- Log if no subscription found (for debugging)
    RAISE NOTICE 'No active subscription found for user % to increment post count', user_uuid;
  END IF;
END;
$$;

