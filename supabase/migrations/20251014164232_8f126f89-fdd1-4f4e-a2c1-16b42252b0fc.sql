-- Add CMS integration fields to blogs table
ALTER TABLE public.blogs 
ADD COLUMN IF NOT EXISTS cms_platform TEXT,
ADD COLUMN IF NOT EXISTS cms_credentials JSONB,
ADD COLUMN IF NOT EXISTS cms_site_url TEXT,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;