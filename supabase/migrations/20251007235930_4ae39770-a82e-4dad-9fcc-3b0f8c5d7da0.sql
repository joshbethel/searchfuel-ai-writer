-- Make articles viewable by everyone (public read access)
-- Keep write operations restricted to authenticated users

-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view their own articles" ON public.articles;

-- Create new public SELECT policy
CREATE POLICY "Anyone can view articles" 
ON public.articles 
FOR SELECT 
USING (true);
