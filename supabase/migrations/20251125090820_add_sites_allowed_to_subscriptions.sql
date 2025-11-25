-- Add sites_allowed column to subscriptions table for multi-site support
-- This column tracks how many sites a user's subscription allows them to create

-- Add the column with a default value of 1
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS sites_allowed INTEGER DEFAULT 1;

-- Update existing subscriptions to ensure they all have a value
-- Default to 1 site for existing users
UPDATE public.subscriptions 
SET sites_allowed = 1 
WHERE sites_allowed IS NULL;

-- Add a check constraint to ensure sites_allowed is always positive
ALTER TABLE public.subscriptions
ADD CONSTRAINT sites_allowed_positive CHECK (sites_allowed > 0);

-- Create index for efficient queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_subscriptions_sites_allowed ON public.subscriptions(sites_allowed);

-- Add comment to document the column
COMMENT ON COLUMN public.subscriptions.sites_allowed IS 'Maximum number of sites/blogs allowed for this subscription. Defaults to 1. Set from Stripe quantity during checkout.';

