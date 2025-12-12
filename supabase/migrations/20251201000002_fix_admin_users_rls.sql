-- Fix RLS policy for admin_users to allow users to check their own admin status
-- Drop the old circular policy
DROP POLICY IF EXISTS "Admins can view admin_users" ON public.admin_users;

-- Create new policies that allow users to check their own status
CREATE POLICY "Users can check their own admin status"
  ON public.admin_users FOR SELECT
  USING (admin_users.user_id = auth.uid());

-- Admins can view all admin_users (for admin dashboard)
CREATE POLICY "Admins can view all admin_users"
  ON public.admin_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid()
    )
  );
