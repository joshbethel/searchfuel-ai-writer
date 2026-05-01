-- Add global weekly sync kill-switch to the admin policy table.
-- Default TRUE so existing behaviour is unchanged on deploy.
ALTER TABLE public.ai_visibility_admin_policy
  ADD COLUMN IF NOT EXISTS weekly_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Ensure the seed row carries the default.
UPDATE public.ai_visibility_admin_policy
  SET weekly_sync_enabled = TRUE
  WHERE id = TRUE AND weekly_sync_enabled IS NULL;

-- Allow admins to read ALL ai_visibility_runs rows (needed for the
-- run-history panel in the admin controls page).
-- The existing per-user SELECT policy is kept intact; this is additive.
DROP POLICY IF EXISTS "Admins can view all ai visibility runs" ON public.ai_visibility_runs;
CREATE POLICY "Admins can view all ai visibility runs"
  ON public.ai_visibility_runs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Index to make the admin "scheduled runs" query fast.
CREATE INDEX IF NOT EXISTS idx_ai_visibility_runs_run_type
  ON public.ai_visibility_runs(run_type, started_at DESC);
