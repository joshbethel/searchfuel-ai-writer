-- Create admin_users table for admin role management
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_users
-- Users can check if they themselves are admins (needed for AdminProtectedRoute)
-- Admins can view all admin_users (for admin dashboard)
CREATE POLICY "Users can check their own admin status"
  ON public.admin_users FOR SELECT
  USING (admin_users.user_id = auth.uid());

CREATE POLICY "Admins can view all admin_users"
  ON public.admin_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Only existing admins can create new admin users
CREATE POLICY "Admins can insert admin_users"
  ON public.admin_users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_created_at ON public.admin_users(created_at);

-- Add trigger for updated_at
CREATE TRIGGER update_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create admin_actions audit log table
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('grant_pro_access', 'revoke_pro_access', 'update_period_end', 'view_content', 'edit_content')),
  target_user_id UUID NOT NULL REFERENCES auth.users(id),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_actions
-- Only admins can view admin_actions
CREATE POLICY "Admins can view admin_actions"
  ON public.admin_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Only admins can insert admin_actions
CREATE POLICY "Admins can insert admin_actions"
  ON public.admin_actions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_user_id ON public.admin_actions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target_user_id ON public.admin_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_action_type ON public.admin_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON public.admin_actions(created_at);

-- Helper function to check if a user is an admin
CREATE OR REPLACE FUNCTION public.is_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
