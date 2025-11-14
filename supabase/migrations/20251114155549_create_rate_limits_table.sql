-- Create rate_limits table for tracking API rate limits
-- This table stores rate limit counters per identifier (IP or user ID) per time window

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on identifier for faster lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON public.rate_limits(identifier);

-- Create index on reset_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON public.rate_limits(reset_at);

-- Enable RLS (Row Level Security) - but allow service role to access
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to do everything (for edge functions)
CREATE POLICY "Service role can manage rate limits"
  ON public.rate_limits
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function to clean up expired rate limit entries (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.rate_limits
  WHERE reset_at < EXTRACT(EPOCH FROM NOW()) - 3600; -- Delete entries older than 1 hour
END;
$$;

-- Optional: Create a scheduled job to run cleanup (requires pg_cron extension)
-- Uncomment if pg_cron is available:
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', 'SELECT cleanup_expired_rate_limits();');

