-- Drop the recursive "Admins can view all admin_users" policy that still exists
DROP POLICY IF EXISTS "Admins can view all admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Users can check their own admin status" ON public.admin_users;