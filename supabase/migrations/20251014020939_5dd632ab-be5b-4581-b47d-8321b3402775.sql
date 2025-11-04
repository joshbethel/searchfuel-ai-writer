-- Add mode column to blogs table to support "new site" vs "existing site"
ALTER TABLE public.blogs 
ADD COLUMN mode text NOT NULL DEFAULT 'new_site' 
CHECK (mode IN ('new_site', 'existing_site'));