-- Make subdomain nullable since existing_site mode doesn't need it
ALTER TABLE public.blogs 
ALTER COLUMN subdomain DROP NOT NULL;