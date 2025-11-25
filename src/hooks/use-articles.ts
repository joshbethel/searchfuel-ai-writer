import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSiteContext } from '@/contexts/SiteContext';

interface BlogPost {
  id: string;
  blog_id: string;
  title: string;
  slug: string;
  status: string;
  publishing_status: string;
  external_post_id: string | null;
  article_type: string;
  created_at: string;
  published_at: string;
  scheduled_publish_date?: string | null;
}

export function useArticles() {
  const { selectedSite } = useSiteContext();
  const [articles, setArticles] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const blogId = selectedSite?.id || null;

  const fetchArticles = useCallback(async () => {
    try {
      // Get user data first since we need it for authorization
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not authenticated");

      // Use selected site from context
      if (!selectedSite) {
        setArticles([]);
        setIsLoading(false);
        return;
      }

      // Fetch posts for the selected site only
      const { data: posts, error: postsError } = await supabase
        .from("blog_posts")
        .select(`
          id,
          blog_id,
          title,
          slug,
          status,
          publishing_status,
          external_post_id,
          article_type,
          created_at,
          published_at,
          scheduled_publish_date
        `)
        .eq("blog_id", selectedSite.id)
        .order('created_at', { ascending: false });

      if (postsError) throw postsError;

      // Map and sort posts
      const mappedPosts = (posts || []).map(post => {
        const mappedPost = {
          id: post.id,
          blog_id: post.blog_id,
          title: post.title,
          slug: post.slug,
          status: post.status,
          publishing_status: post.publishing_status,
          external_post_id: post.external_post_id,
          article_type: post.article_type,
          created_at: post.created_at,
          published_at: post.published_at,
          scheduled_publish_date: post.scheduled_publish_date
        } as BlogPost;
        
        return mappedPost;
      });
      
      const sortedPosts = mappedPosts.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setArticles(sortedPosts);

    } catch (error: any) {
      console.error("Error loading articles:", error);
      const message = error.message || "Failed to load articles";
      if (message.includes("JWT")) {
        toast.error("Session expired. Please log in again.");
      } else {
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedSite]);

  return {
    articles,
    isLoading,
    blogId,
    fetchArticles,
    setArticles
  };
}