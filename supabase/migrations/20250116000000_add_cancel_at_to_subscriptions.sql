-- Add cancel_at field to subscriptions table to track future cancellation dates
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient queries on cancel_at
CREATE INDEX IF NOT EXISTS idx_subscriptions_cancel_at ON public.subscriptions(cancel_at);

