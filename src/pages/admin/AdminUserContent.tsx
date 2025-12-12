import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, FileText, BookOpen, Newspaper, Tag } from "lucide-react";

interface ContentSummary {
  blogs_count: number;
  blog_posts_count: number;
  articles_count: number;
  keywords_count: number;
}

export default function AdminUserContent() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ContentSummary | null>(null);

  useEffect(() => {
    if (userId) {
      loadUserContent();
    }
  }, [userId]);

  const loadUserContent = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      // Get content summary
      const { data, error } = await supabase.functions.invoke("admin-get-user-content", {
        body: {
          target_user_id: userId,
          content_type: 'all',
        },
      });

      if (error) throw error;

      if (data?.success && data?.summary) {
        setSummary(data.summary);
      } else {
        throw new Error(data?.error || "Failed to load content summary");
      }
    } catch (error: any) {
      console.error("Error loading user content:", error);
      toast.error(error.message || "Failed to load user content");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="mb-4">
          <h1 className="text-3xl font-bold mb-2">User Content</h1>
          <p className="text-muted-foreground">Overview of all content types for this user</p>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/admin/users/${userId}/blogs`)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Blogs</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.blogs_count}</div>
              <p className="text-xs text-muted-foreground mt-1">User blogs</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/admin/users/${userId}/blog-posts`)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Blog Posts</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.blog_posts_count}</div>
              <p className="text-xs text-muted-foreground mt-1">Published posts</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/admin/users/${userId}/articles`)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Articles</CardTitle>
              <Newspaper className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.articles_count}</div>
              <p className="text-xs text-muted-foreground mt-1">Generated articles</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/admin/users/${userId}/keywords`)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Keywords</CardTitle>
              <Tag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.keywords_count}</div>
              <p className="text-xs text-muted-foreground mt-1">Tracked keywords</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

