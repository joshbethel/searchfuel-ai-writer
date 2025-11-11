-- Add cancellation_details field to subscriptions table to store cancellation reason, comment, and feedback
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS cancellation_details JSONB;

-- Add index for efficient queries on cancellation_details (useful for analytics)
CREATE INDEX IF NOT EXISTS idx_subscriptions_cancellation_details ON public.subscriptions USING GIN (cancellation_details);

