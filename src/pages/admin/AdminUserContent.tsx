import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, FileText, BookOpen, Newspaper, Tag } from "lucide-react";

interface ContentSummary {
  blogs_count: number;
  blog_posts_count: number;
  articles_count: number;
  keywords_count: number;
}

interface UserInfo {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
  };
}

export default function AdminUserContent() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ContentSummary | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    if (userId) {
      loadUserContent();
    }
  }, [userId]);

  const loadUserContent = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      // Get user info from admin-search-users function
      const { data: searchData, error: searchError } = await supabase.functions.invoke("admin-search-users", {
        body: { query: userId },
      });

      if (!searchError && searchData?.success && searchData?.users?.length > 0) {
        const user = searchData.users[0];
        setUserInfo({
          id: user.id,
          email: user.email || '',
          user_metadata: user.user_metadata,
        });
      }

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
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Admin Dashboard
        </Button>

        <div className="mb-4">
          <h1 className="text-3xl font-bold mb-2">User Content</h1>
          {userInfo && (
            <div className="flex items-center gap-4 text-muted-foreground">
              <span>{userInfo.email}</span>
              {(userInfo.user_metadata?.name || userInfo.user_metadata?.full_name) && (
                <span>• {userInfo.user_metadata?.name || userInfo.user_metadata?.full_name}</span>
              )}
              <Badge variant="outline" className="font-mono text-xs">
                {userInfo.id.substring(0, 8)}...
              </Badge>
            </div>
          )}
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

