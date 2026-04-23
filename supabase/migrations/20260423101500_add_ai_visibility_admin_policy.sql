-- Persisted admin policy for AI visibility run budget caps.
CREATE TABLE IF NOT EXISTS public.ai_visibility_admin_policy (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  max_cost_usd NUMERIC(10,2) NOT NULL DEFAULT 5.00 CHECK (max_cost_usd >= 1.00),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_visibility_admin_policy ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read the current policy cap.
CREATE POLICY "Authenticated users can view AI visibility admin policy"
  ON public.ai_visibility_admin_policy
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert/update the policy.
CREATE POLICY "Admins can insert AI visibility admin policy"
  ON public.ai_visibility_admin_policy
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update AI visibility admin policy"
  ON public.ai_visibility_admin_policy
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.ai_visibility_admin_policy (id, max_cost_usd)
VALUES (TRUE, 5.00)
ON CONFLICT (id) DO NOTHING;
