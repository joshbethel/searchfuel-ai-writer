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

export default function Calendar() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [blogId, setBlogId] = useState<string | null>(null);

  useEffect(() => {
    fetchBlogAndArticles();
  }, []);

  const fetchBlogAndArticles = async () => {
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

      // Fetch articles
      const { data: posts, error: postsError } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("blog_id", blog.id)
        .order("scheduled_publish_date", { ascending: true });

      if (postsError) throw postsError;
      setArticles(posts || []);
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
        articles={articles}
        onViewArticle={handleViewArticle}
        onEditArticle={handleEditArticle}
      />
    </div>
  );
}
