-- Add admin role system
-- Create admin_users table to track admin users
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  notes text
);

-- Enable RLS on admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Create admin_actions table for audit logging
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action_type text NOT NULL,
  target_user_id uuid,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on admin_actions
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_users (only service role can manage)
CREATE POLICY "Service role can manage admin_users"
ON public.admin_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- RLS policies for admin_actions (only service role can manage)
CREATE POLICY "Service role can manage admin_actions"
ON public.admin_actions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add is_manual column to subscriptions table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'subscriptions' 
    AND column_name = 'is_manual'
  ) THEN
    ALTER TABLE public.subscriptions ADD COLUMN is_manual boolean DEFAULT false;
  END IF;
END $$;