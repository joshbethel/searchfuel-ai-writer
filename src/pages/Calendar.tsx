import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MonthlyCalendarView } from "@/components/MonthlyCalendarView";
import { Loader2, AlertTriangle, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const [cmsConnected, setCmsConnected] = useState<boolean | null>(null);

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
        .select("id, cms_platform, cms_site_url, cms_credentials")
        .eq("user_id", user.id)
        .single();

      if (blogError) throw blogError;
      if (!blog) {
        toast.error("No blog found");
        return;
      }

      setBlogId(blog.id);
      
      // Check CMS connection status
      const isConnected = !!(blog?.cms_platform && blog?.cms_site_url && blog?.cms_credentials);
      setCmsConnected(isConnected);

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

  if (!blogId) {
    return (
      <div className="container mx-auto py-12 px-4">
        <div className="max-w-2xl mx-auto">
          {/* <h1 className="text-3xl font-bold text-foreground mb-2">Calendar</h1>
          <p className="text-muted-foreground mb-6">Plan and schedule your articles</p> */}
          
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <CalendarIcon className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">No Blog Found</h3>
              <p className="text-muted-foreground mb-6">
                You need to set up your blog first to view the scheduling calendar.
              </p>
              <Button onClick={() => navigate("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold text-foreground mb-2">Calendar</h1>
      <p className="text-muted-foreground mb-6">Plan and schedule your articles</p>
      
      {cmsConnected === false && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">CMS Not Connected</h3>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Your CMS is not connected. Scheduled items are stored locally but publishing is disabled. Go to your <button onClick={() => navigate("/dashboard")} className="underline font-medium hover:no-underline">dashboard</button> to connect a CMS.
              </p>
            </div>
          </div>
        </Card>
      )}
      
      <MonthlyCalendarView
        scheduledItems={scheduledItems}
        onViewArticle={handleViewArticle}
        onEditArticle={handleEditArticle}
      />
    </div>
  );
}
