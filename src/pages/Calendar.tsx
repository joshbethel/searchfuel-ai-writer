import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MonthlyCalendarView } from "@/components/MonthlyCalendarView";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Article {
  id: string;
  title: string;
  slug: string;
  status: string;
  publishing_status: string | null;
  scheduled_publish_date?: string | null;
  created_at: string;
  article_type: string | null;
  excerpt?: string | null;
}

interface ScheduledItem {
  id: string;
  title: string;
  status: string;
  scheduled_date: string;
  type: 'post' | 'keyword';
}

export default function Calendar() {
  const navigate = useNavigate();
  const [scheduledItems, setScheduledItems] = useState<ScheduledItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [blogId, setBlogId] = useState<string | null>(null);

  useEffect(() => {
    fetchBlogAndScheduledItems();
  }, []);

  const fetchBlogAndScheduledItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Get user's blog
      const { data: blog, error: blogError } = await supabase
        .from("blogs")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (blogError) throw blogError;
      if (!blog) {
        toast.error("No blog found");
        return;
      }

      setBlogId(blog.id);

      // Fetch blog posts
      const { data: posts, error: postsError } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("blog_id", blog.id)
        .not("scheduled_publish_date", "is", null)
        .order("scheduled_publish_date", { ascending: true });

      if (postsError) throw postsError;

      // Fetch scheduled keywords
      const { data: scheduledKeywords, error: keywordsError } = await supabase
        .from("scheduled_keywords")
        .select("*")
        .eq("blog_id", blog.id)
        .order("scheduled_date", { ascending: true });

      if (keywordsError) throw keywordsError;

      // Combine both into a unified structure
      const items: ScheduledItem[] = [
        ...(posts || []).map(post => ({
          id: post.id,
          title: post.title,
          status: post.publishing_status || 'pending',
          scheduled_date: post.scheduled_publish_date!,
          type: 'post' as const,
        })),
        ...(scheduledKeywords || []).map(keyword => ({
          id: keyword.id,
          title: keyword.keyword,
          status: keyword.status,
          scheduled_date: keyword.scheduled_date,
          type: 'keyword' as const,
        })),
      ];

      setScheduledItems(items);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load calendar");
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewArticle = (id: string) => {
    navigate(`/article/${id}`);
  };

  const handleEditArticle = (id: string) => {
    // Navigate to articles page with edit mode
    navigate(`/articles?edit=${id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <MonthlyCalendarView
        scheduledItems={scheduledItems}
        onViewArticle={handleViewArticle}
        onEditArticle={handleEditArticle}
      />
    </div>
  );
}
