-- Per-site weekly sync toggle, separate from is_paused so manual syncs
-- are unaffected when an admin excludes a site from the weekly run.
ALTER TABLE public.ai_visibility_settings
  ADD COLUMN IF NOT EXISTS weekly_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Allow admins to read ALL ai_visibility_settings rows so the schedule
-- admin page can list every configured site.
DROP POLICY IF EXISTS "Admins can view all ai visibility settings" ON public.ai_visibility_settings;
CREATE POLICY "Admins can view all ai visibility settings"
  ON public.ai_visibility_settings
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Allow admins to update ai_visibility_settings (used to flip
-- weekly_sync_enabled per site from the admin schedule page).
DROP POLICY IF EXISTS "Admins can update all ai visibility settings" ON public.ai_visibility_settings;
CREATE POLICY "Admins can update all ai visibility settings"
  ON public.ai_visibility_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
