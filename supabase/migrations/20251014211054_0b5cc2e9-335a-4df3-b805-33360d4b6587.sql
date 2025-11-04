-- Enable realtime for keywords table
ALTER TABLE public.keywords REPLICA IDENTITY FULL;

-- Add the keywords table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.keywords;