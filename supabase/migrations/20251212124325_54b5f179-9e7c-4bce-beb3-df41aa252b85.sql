-- Drop the recursive policies
DROP POLICY IF EXISTS "Admins can view all admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Users can check their own admin status" ON public.admin_users;

-- Create a security definer function to check admin status without triggering RLS
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE user_id = _user_id
  )
$$;

-- Create simple policy: users can only see their own admin record
CREATE POLICY "Users can view own admin status"
  ON public.admin_users FOR SELECT
  USING (user_id = auth.uid());