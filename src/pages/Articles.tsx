import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArticles } from "@/hooks/use-articles";
import KeywordPanel from '@/components/KeywordPanel';
import { GenerateArticleDialog } from "@/components/GenerateArticleDialog";
import { ArticleCalendar } from "@/components/ArticleCalendar";
import { EditArticleDialog } from "@/components/EditArticleDialog";
import { RescheduleArticleDialog } from "@/components/RescheduleArticleDialog";
import { toast } from "sonner";
import { Loader2, FileText, Eye, Clock, AlertCircle, Calendar, Edit, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ARTICLE_TYPE_LABELS: Record<string, { name: string; emoji: string }> = {
  how_to: { name: "How-To Guides", emoji: "📚" },
  listicle: { name: "Listicles", emoji: "📝" },
  qa: { name: "Q&A Articles", emoji: "❓" },
  news: { name: "News & Updates", emoji: "📰" },
  roundup: { name: "Product Roundups", emoji: "🔍" },
  versus: { name: "Comparison Articles", emoji: "⚖️" },
  checklist: { name: "Checklists", emoji: "✅" },
  advertorial: { name: "Advertorials", emoji: "📢" },
  interactive_tool: { name: "Interactive Tools", emoji: "🛠️" },
};

const getPublishingStatusBadge = (status: string, scheduledDate?: string | null) => {
  switch (status) {
    case 'published':
      return <Badge variant="default" className="bg-green-600">Published</Badge>;
    case 'scheduled':
      return (
        <Badge variant="secondary" className="bg-purple-600 text-white">
          Scheduled {scheduledDate && `(${format(parseISO(scheduledDate), 'MMM d, h:mm a')})`}
        </Badge>
      );
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'pending':
      return <Badge variant="secondary" className="bg-blue-600 text-white">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

interface ScheduledKeyword {
  id: string;
  keyword: string;
  scheduled_date: string;
  status: string;
  created_at: string;
}

export default function Articles() {
  const navigate = useNavigate();
  const { articles, isLoading, blogId, fetchArticles, setArticles } = useArticles();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isGeneratingArticle, setIsGeneratingArticle] = useState(false);
  const [editArticleId, setEditArticleId] = useState<string | null>(null);
  const [rescheduleArticleId, setRescheduleArticleId] = useState<string | null>(null);
  const [rescheduleArticleDate, setRescheduleArticleDate] = useState<string | null>(null);
  const [scheduledKeywords, setScheduledKeywords] = useState<ScheduledKeyword[]>([]);
  const [isLoadingScheduled, setIsLoadingScheduled] = useState(true);
  const [cmsConnected, setCmsConnected] = useState<boolean | null>(null);
  const [cmsPlatform, setCmsPlatform] = useState<string | null>(null);

  // Check CMS connection status
  const checkCMSConnection = useCallback(async () => {
    if (!blogId) {
      setCmsConnected(false);
      return;
    }

    try {
      const { data: blog, error } = await supabase
        .from("blogs")
        .select("cms_platform, cms_site_url, cms_credentials")
        .eq("id", blogId)
        .single();

      if (error) {
        console.error("Error checking CMS connection:", error);
        setCmsConnected(false);
        return;
      }

      const isConnected = !!(blog?.cms_platform && blog?.cms_site_url && blog?.cms_credentials);
      setCmsConnected(isConnected);
      setCmsPlatform(blog?.cms_platform || null);
    } catch (error) {
      console.error("Error checking CMS connection:", error);
      setCmsConnected(false);
    }
  }, [blogId]);

  // Fetch scheduled keywords
  const fetchScheduledKeywords = useCallback(async () => {
    if (!blogId) return;
    
    try {
      const { data, error } = await supabase
        .from("scheduled_keywords")
        .select("*")
        .eq("blog_id", blogId)
        .eq("status", "pending")
        .order("scheduled_date", { ascending: true });

      if (error) throw error;
      setScheduledKeywords(data || []);
    } catch (error) {
      console.error("Error fetching scheduled keywords:", error);
    } finally {
      setIsLoadingScheduled(false);
    }
  }, [blogId]);

  useEffect(() => {
    if (blogId) {
      fetchScheduledKeywords();
      checkCMSConnection();
    }
  }, [blogId, fetchScheduledKeywords, checkCMSConnection]);

  const handlePublishNow = async (postId: string) => {
    if (!blogId) return;

    try {
      toast.info("Publishing post...");
      
      // First clear any scheduled publish date
      await supabase
        .from("blog_posts")
        .update({
          scheduled_publish_date: null,
          publishing_status: "pending"
        })
        .eq("id", postId);
      
      // Verify the post exists before trying to publish
      const { data: postCheck, error: postCheckError } = await supabase
        .from("blog_posts")
        .select("id, title, blog_id, publishing_status")
        .eq("id", postId)
        .single();
        
      if (postCheckError) throw new Error("Could not find post to publish");
      
      // Verify the blog exists and has CMS configuration
      const { data: blogCheck, error: blogCheckError } = await supabase
        .from("blogs")
        .select("id, cms_platform, cms_site_url, cms_credentials")
        .eq("id", postCheck.blog_id)
        .single();
        
      if (blogCheckError) throw new Error("Could not find blog configuration");
      
      if (!blogCheck.cms_platform || !blogCheck.cms_credentials) {
        throw new Error("WordPress/CMS is not properly configured");
      }
      
      const { data, error } = await supabase.functions.invoke("publish-to-cms", {
        body: { blog_post_id: postId },
      });

      if (data.success) {
        // Get the updated post data to show post ID
        const { data: updatedPost } = await supabase
          .from("blog_posts")
          .select("external_post_id, blog_id, blogs(cms_platform)")
          .eq("id", postId)
          .single();

        const platform = updatedPost?.blogs?.cms_platform;
        
        if (platform === 'framer' && updatedPost?.external_post_id) {
          toast.success(`Article published to Framer! Post ID: ${updatedPost.external_post_id}`);
        } else if (updatedPost?.external_post_id) {
          toast.success(`Post published successfully! Post ID: ${updatedPost.external_post_id}`);
        } else {
          toast.success("Post published successfully!");
        }
        
        await fetchArticles();
        await fetchScheduledKeywords();
      }
    } catch (error: any) {
      console.error("Error publishing post:", error);
      toast.error(error.message || "Failed to publish post");
    }
  };

  // Check for scheduled posts that need to be published
  const checkScheduledPosts = useCallback(async () => {
    const now = new Date();
    
    // Find posts that are scheduled and their time has come
    const scheduledPosts = articles.filter(post => 
      post.scheduled_publish_date && 
      new Date(post.scheduled_publish_date) <= now &&
      post.publishing_status !== 'published'  // Only check non-published posts
    );

    for (const post of scheduledPosts) {
      console.log(`Publishing scheduled post: ${post.id} at ${now.toISOString()}`);
      try {
        await handlePublishNow(post.id);
        toast.success(`Scheduled post "${post.title}" has been published!`);
        
        // After successful publishing, fetch articles to update the list
        await fetchArticles();
        await fetchScheduledKeywords();
      } catch (error) {
        console.error(`Failed to publish scheduled post ${post.id}:`, error);
        toast.error(`Failed to publish scheduled post "${post.title}"`);
      }
    }
  }, [articles, handlePublishNow, fetchArticles]);

  // Check for scheduled posts periodically
  useEffect(() => {
    // Initial check
    checkScheduledPosts();

    // Set up periodic checking every minute
    const interval = setInterval(checkScheduledPosts, 60000);

    return () => clearInterval(interval);
  }, [checkScheduledPosts]);

  // Initial fetch
  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("blog_posts")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      setArticles(articles.filter((a) => a.id !== deleteId));
      toast.success("Article deleted successfully");
    } catch (error: any) {
      console.error("Error deleting article:", error);
      toast.error("Failed to delete article: " + error.message);
    } finally {
      setDeleteId(null);
    }
  };

  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  const handleGenerateArticle = async (scheduleDate?: Date) => {
    if (!blogId) {
      toast.error("No blog found. Please connect your CMS first.");
      return;
    }

    // Check subscription before generating
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to generate articles");
        return;
      }

      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status, plan_name')
        .eq('user_id', user.id)
        .maybeSingle();

      const hasActiveSubscription = subscription && 
        (subscription.status === 'active' || subscription.status === 'trialing') &&
        subscription.plan_name !== null &&
        subscription.plan_name !== 'free';

      if (!hasActiveSubscription) {
        toast.error("Please upgrade to Pro to generate articles");
        navigate("/plans");
        return;
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      toast.error("Failed to verify subscription. Please try again.");
      return;
    }
    
    setIsGeneratingArticle(true);
    setShowGenerateDialog(false);
    toast.info("Generating article... This may take a minute.");
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-blog-post', {
        body: { 
          blogId,
          scheduledPublishDate: scheduleDate?.toISOString()
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        if (scheduleDate) {
          toast.success(`Article scheduled for publication on ${format(scheduleDate, "PPP 'at' p")}`);
        } else if (cmsPlatform === 'framer') {
          // Framer articles don't auto-publish
          toast.success("Article write done! ✓");
          toast.info("Article is pending - click 'Publish' to publish it to Framer");
        } else if (data.results?.[0]?.success) {
          toast.success("Article generated successfully!");
          toast.info("Article published to CMS!");
        } else {
          toast.success("Article generated successfully!");
          toast.warning(`Article created but publishing failed: ${data.results?.[0]?.error}`);
        }
        await fetchArticles();
      } else {
        toast.warning("Article generation completed with issues");
      }
      
      await fetchArticles();
      await fetchScheduledKeywords();
    } catch (error: any) {
      console.error('Article generation error:', error);
      
      // Check if it's a limit exceeded error
      if (error?.context?.body?.code === 'LIMIT_EXCEEDED') {
        toast.error(error.context.body.error || "You have reached your monthly post limit. Please upgrade your plan.");
      } else {
        toast.error(error.message || "Failed to generate article");
      }
    } finally {
      setIsGeneratingArticle(false);
    }
  };

  if (isLoading || isLoadingScheduled) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!articles?.length) {
    return (
      <div className="container max-w-6xl mx-auto py-12 px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Articles</h1>
            <p className="text-muted-foreground">Manage your generated blog posts</p>
          </div>
        </div>

        <Card className="p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">
              No Posts Generated Yet
            </h3>
            <p className="text-muted-foreground mb-6">
              Your AI engine is ready! Generate your first article or connect your CMS to enable automatic publishing.
            </p>
            <div className="flex gap-3 justify-center">
              <Button 
                onClick={() => setShowGenerateDialog(true)} 
                disabled={!blogId}
              >
                <FileText className="w-4 h-4 mr-2" />
                Generate Article
              </Button>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
            {!blogId && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-4">
                💡 Tip: Connect your CMS first to enable article generation and publishing
              </p>
            )}
          </div>
        </Card>
        
        <GenerateArticleDialog
          open={showGenerateDialog}
          onOpenChange={setShowGenerateDialog}
          onGenerate={handleGenerateArticle}
          isGenerating={isGeneratingArticle}
        />
      </div>
    );
  }

  // Debug current articles
  console.log('All articles:', articles.map(a => ({
    id: a.id,
    status: a.publishing_status,
    scheduled_date: a.scheduled_publish_date
  })));

  // Separate posts by status
  const scheduledPosts = articles.filter(a => {
    const isScheduled = a.scheduled_publish_date !== null;
    if (isScheduled) {
      console.log('Found scheduled post:', {
        id: a.id,
        status: a.publishing_status,
        date: a.scheduled_publish_date
      });
    }
    return isScheduled;
  });

  const pendingPosts = articles.filter(a => 
    a.publishing_status === 'pending' && 
    !a.scheduled_publish_date
  );
  const publishedPosts = articles.filter(a => a.publishing_status === 'published');
  const failedPosts = articles.filter(a => a.publishing_status === 'failed');

  return (
    <div className="container max-w-6xl mx-auto py-12 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-foreground mb-2">Articles</h1>
          <p className="text-muted-foreground">
            {scheduledPosts.length + scheduledKeywords.length} scheduled · {pendingPosts.length} pending · {publishedPosts.length} published · {failedPosts.length} failed
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowGenerateDialog(true)}
            disabled={isGeneratingArticle || !blogId}
          >
            {isGeneratingArticle && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <FileText className="w-4 h-4 mr-2" />
            Generate New Article
          </Button>
        </div>
        
        <GenerateArticleDialog
          open={showGenerateDialog}
          onOpenChange={setShowGenerateDialog}
          onGenerate={handleGenerateArticle}
          isGenerating={isGeneratingArticle}
        />
        
        <EditArticleDialog
          articleId={editArticleId}
          open={editArticleId !== null}
          onOpenChange={(open) => !open && setEditArticleId(null)}
          onSaved={fetchArticles}
        />

        <RescheduleArticleDialog
          articleId={rescheduleArticleId}
          open={rescheduleArticleId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setRescheduleArticleId(null);
              setRescheduleArticleDate(null);
            }
          }}
          onSaved={fetchArticles}
          currentScheduledDate={rescheduleArticleDate}
        />
      </div>

      {cmsConnected === false && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">CMS Not Connected</h3>
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                Your CMS is not connected. Articles are stored locally but publishing is disabled. Go to your <button onClick={() => navigate("/dashboard")} className="underline font-medium hover:no-underline">dashboard</button> to connect a CMS.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="scheduled" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="scheduled" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Scheduled
            <Badge variant="secondary" className="ml-1 bg-purple-600 text-white">
              {scheduledPosts.length + scheduledKeywords.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending
            <Badge variant="secondary" className="ml-1 bg-blue-600 text-white">
              {pendingPosts.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="published" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Published
            <Badge variant="secondary" className="ml-1 bg-green-600 text-white">
              {publishedPosts.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="failed" className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Failed
            <Badge variant="destructive" className="ml-1">
              {failedPosts.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scheduled" className="mt-6">
          <div className="grid gap-4">
            {scheduledKeywords.map((keyword) => (
              <Card key={keyword.id} className="p-6 hover:shadow-md transition-shadow w-[99%] mx-auto border-dashed">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="bg-yellow-600 text-white">Queued for Generation</Badge>
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      {keyword.keyword}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>Scheduled for {format(parseISO(keyword.scheduled_date), 'MMM d, yyyy')}</span>
                      </div>
                      <span>Added {format(parseISO(keyword.created_at), 'MMM d, yyyy')}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      This article will be automatically generated and published on the scheduled date
                    </p>
                  </div>
                </div>
              </Card>
            ))}

            {scheduledPosts.length === 0 && scheduledKeywords.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">
                No scheduled posts yet
              </Card>
            ) : scheduledPosts.map((post) => (
                <Card key={post.id} className="p-6 hover:shadow-md transition-shadow w-[99%] mx-auto">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="bg-purple-600 text-white">Scheduled</Badge>
                        {post.article_type && (
                          <Badge variant="outline">
                            {ARTICLE_TYPE_LABELS[post.article_type]?.emoji} {ARTICLE_TYPE_LABELS[post.article_type]?.name || post.article_type}
                          </Badge>
                        )}
                      </div>
                      <h3 className="text-xl font-semibold text-foreground mb-2">
                        {post.title}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span>
                              {post.scheduled_publish_date ? 
                                `Scheduled for ${format(parseISO(post.scheduled_publish_date), "PPP 'at' p")}` :
                                'Not scheduled'
                              }
                            </span>
                          </div>
                          {post.scheduled_publish_date && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-3 text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
                              onClick={() => {
                                setRescheduleArticleId(post.id);
                                setRescheduleArticleDate(post.scheduled_publish_date);
                              }}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Reschedule
                            </Button>
                          )}
                        </div>
                        {post.external_post_id && (
                          <Badge variant="outline" className="text-xs">
                            Post ID: {post.external_post_id}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2 mb-6">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handlePublishNow(post.id)}
                        >
                          Publish Now
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/blog/${post.slug}`)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </Button>
                      </div>
                      <div>
                        <KeywordPanel id={post.id} kind="blog_post" />
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            }
          </div>
        </TabsContent>

        <TabsContent value="pending" className="mt-6">
          <div className="grid gap-4">
            {pendingPosts.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">
                No pending posts
              </Card>
            ) : pendingPosts.map((post, index) => {
              const estimatedDate = new Date();
              estimatedDate.setDate(estimatedDate.getDate() + index);
              
              return (
                <Card key={post.id} className="p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="bg-blue-600 text-white">Pending</Badge>
                        {post.article_type && (
                          <Badge variant="outline">
                            {ARTICLE_TYPE_LABELS[post.article_type]?.emoji} {ARTICLE_TYPE_LABELS[post.article_type]?.name || post.article_type}
                          </Badge>
                        )}
                      </div>
                      <h3 className="text-xl font-semibold text-foreground mb-2">
                        {post.title}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>Scheduled for {format(estimatedDate, 'MMM d, yyyy')}</span>
                        </div>
                        <span>Created {format(new Date(post.created_at), 'MMM d, yyyy')}</span>
                        {post.external_post_id && (
                          <Badge variant="outline" className="text-xs">
                            Post ID: {post.external_post_id}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handlePublishNow(post.id)}
                        >
                          Publish Now
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRescheduleArticleId(post.id);
                            setRescheduleArticleDate(null);
                          }}
                        >
                          <Calendar className="w-4 h-4 mr-2" />
                          Schedule
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/blog/${post.slug}`)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditArticleId(post.id)}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteId(post.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <KeywordPanel id={post.id} kind="blog_post" />
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="published" className="mt-6">
          <div className="grid gap-4">
            {publishedPosts.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">
                No published posts yet
              </Card>
            ) : publishedPosts.map((post) => (
              <Card key={post.id} className="p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="default" className="bg-green-600">Published</Badge>
                      {post.article_type && (
                        <Badge variant="outline">
                          {ARTICLE_TYPE_LABELS[post.article_type]?.emoji} {ARTICLE_TYPE_LABELS[post.article_type]?.name || post.article_type}
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Published {format(new Date(post.published_at || post.created_at), 'MMM d, yyyy')}</span>
                      {post.external_post_id && (
                        <Badge variant="outline" className="text-xs">
                          Post ID: {post.external_post_id}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditArticleId(post.id)}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/blog/${post.slug}`)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <KeywordPanel id={post.id} kind="blog_post" />
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="failed" className="mt-6">
          <div className="grid gap-4">
            {failedPosts.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">
                No failed posts
              </Card>
            ) : failedPosts.map((post) => (
              <Card key={post.id} className="p-6 border-red-200 dark:border-red-900 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="destructive">Failed</Badge>
                      {post.article_type && (
                        <Badge variant="outline">
                          {ARTICLE_TYPE_LABELS[post.article_type]?.emoji} {ARTICLE_TYPE_LABELS[post.article_type]?.name || post.article_type}
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Created {format(new Date(post.created_at), 'MMM d, yyyy')}</span>
                      {post.external_post_id && (
                        <Badge variant="outline" className="text-xs">
                          Post ID: {post.external_post_id}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePublishNow(post.id)}
                    >
                      Retry Publish
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/blog/${post.slug}`)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Article</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this article? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}