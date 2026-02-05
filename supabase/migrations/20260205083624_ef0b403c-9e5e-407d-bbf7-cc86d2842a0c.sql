-- API Keys table for external integrations (Framer plugin, etc.)
-- Supports scoped permissions and optional expiration

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,                    -- User-friendly name (e.g., "Framer Plugin")
  key_hash VARCHAR(255) NOT NULL,                -- SHA-256 hash of the key (never store plain key)
  key_prefix VARCHAR(12) NOT NULL,               -- First 12 chars for display (e.g., "sk_live_a1b2")
  scopes TEXT[] NOT NULL DEFAULT ARRAY['posts:publish', 'posts:read'],  -- Permission scopes
  expires_at TIMESTAMP WITH TIME ZONE,           -- Optional expiration date (NULL = never expires)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(key_hash)
);

-- Index for fast lookups by user
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Index for fast lookups by key hash (used during authentication)
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);

-- GIN index for scope queries
CREATE INDEX idx_api_keys_scopes ON api_keys USING GIN(scopes);

-- Enable Row Level Security
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can view their own API keys
CREATE POLICY "Users can view own API keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own API keys
CREATE POLICY "Users can insert own API keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own API keys (for revoking, updating last_used_at)
CREATE POLICY "Users can update own API keys"
  ON api_keys FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own API keys
CREATE POLICY "Users can delete own API keys"
  ON api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- Comment on table
COMMENT ON TABLE api_keys IS 'API keys for external integrations with scoped permissions';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the API key - plain key is never stored';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 12 characters of the key for display purposes';
COMMENT ON COLUMN api_keys.scopes IS 'Array of permission scopes: posts:read, posts:write, posts:publish, sites:read, keywords:read, keywords:write, full_access';
COMMENT ON COLUMN api_keys.expires_at IS 'Optional expiration timestamp - NULL means never expires';
COMMENT ON COLUMN api_keys.revoked_at IS 'Timestamp when key was revoked - NULL means active';