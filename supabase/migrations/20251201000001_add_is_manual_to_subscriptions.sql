-- Add is_manual flag to subscriptions table for manual Pro access tracking
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false;

-- Create index for efficient queries on manual subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_is_manual ON public.subscriptions(is_manual);

-- Add comment to document the field
COMMENT ON COLUMN public.subscriptions.is_manual IS 'Indicates if Pro access was granted manually by admin (true) or via Stripe payment (false). Manual subscriptions will also have metadata.is_manual = true in Stripe.';
