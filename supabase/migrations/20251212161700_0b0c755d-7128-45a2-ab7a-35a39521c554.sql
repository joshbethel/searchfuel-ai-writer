-- Add admin role management actions to admin_actions table
-- Update the CHECK constraint to include grant_admin_role and revoke_admin_role

ALTER TABLE public.admin_actions
DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;

ALTER TABLE public.admin_actions
ADD CONSTRAINT admin_actions_action_type_check 
CHECK (action_type IN (
  'grant_pro_access', 
  'revoke_pro_access', 
  'update_period_end', 
  'update_sites_allowed',
  'view_content', 
  'edit_content',
  'grant_admin_role',
  'revoke_admin_role'
));