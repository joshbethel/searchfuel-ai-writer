-- Fix increment_post_count to also handle 'trialing' status
-- and add better error handling
-- IMPORTANT: This function uses SECURITY DEFINER to bypass RLS policies

CREATE OR REPLACE FUNCTION increment_post_count(user_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_subscription RECORD;
  old_count INTEGER;
  new_count INTEGER;
  rows_updated INTEGER;
BEGIN
  -- Get user's active or trialing subscription
  SELECT * INTO user_subscription
  FROM subscriptions
  WHERE user_id = user_uuid
    AND status IN ('active', 'trialing')
    AND plan_name IS NOT NULL
    AND plan_name != 'free';
  
  IF user_subscription IS NOT NULL THEN
    old_count := COALESCE(user_subscription.posts_generated_count, 0);
    new_count := old_count + 1;
    
    -- Increment count for subscribed user
    -- Using SECURITY DEFINER, this should bypass RLS
    UPDATE subscriptions
    SET posts_generated_count = new_count,
        updated_at = now()
    WHERE id = user_subscription.id;
    
    -- Check if update actually happened
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    -- Log the increment (for debugging)
    RAISE NOTICE 'Incremented post count for user % (subscription %): % -> % (rows updated: %)', 
      user_uuid,
      user_subscription.id,
      old_count,
      new_count,
      rows_updated;
      
    IF rows_updated = 0 THEN
      RAISE WARNING 'UPDATE did not affect any rows for subscription %', user_subscription.id;
    END IF;
  ELSE
    -- Log if no subscription found (for debugging)
    RAISE NOTICE 'No active subscription found for user % to increment post count', user_uuid;
  END IF;
END;
$$;

