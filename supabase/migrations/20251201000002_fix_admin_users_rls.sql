-- Fix RLS policies to remove circular dependencies
-- The issue: Policies that check admin_users from within admin_users cause infinite recursion

-- Drop ALL existing policies that cause recursion
DROP POLICY IF EXISTS "Admins can view admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Users can check their own admin status" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can view all admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can insert admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can view admin_actions" ON public.admin_actions;
DROP POLICY IF EXISTS "Admins can insert admin_actions" ON public.admin_actions;

-- Create ONLY the simple policy that allows users to check their own admin status
-- This avoids circular dependency - it only checks if user_id matches auth.uid()
CREATE POLICY "Users can check their own admin status"
  ON public.admin_users FOR SELECT
  USING (admin_users.user_id = auth.uid());

-- For INSERT: Allow authenticated users to insert (we'll use a function to verify admin status)
-- The add_admin_user function will check admin status using SECURITY DEFINER
CREATE POLICY "Authenticated users can insert admin_users"
  ON public.admin_users FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Create function to add admin users (bypasses RLS using SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.add_admin_user(target_user_id UUID, admin_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Check if the caller is an admin using the function (bypasses RLS)
  IF NOT public.is_admin(admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can add other admins';
  END IF;
  
  -- Insert the admin user
  INSERT INTO public.admin_users (user_id, created_by)
  VALUES (target_user_id, admin_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- For admin_actions: Use the is_admin() function which has SECURITY DEFINER
-- This bypasses RLS and avoids circular dependency
CREATE POLICY "Admins can view admin_actions"
  ON public.admin_actions FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert admin_actions"
  ON public.admin_actions FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));
