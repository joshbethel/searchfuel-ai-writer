import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useArticles } from "@/hooks/use-articles";
import KeywordPanel from '@/components/KeywordPanel';
import { GenerateArticleDialog } from "@/components/GenerateArticleDialog";
import { toast } from "sonner";
import { Loader2, FileText, Eye, Clock, AlertCircle, Calendar } from "lucide-react";
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

export default function Articles() {
  const navigate = useNavigate();
  const { articles, isLoading, blogId, fetchArticles, setArticles } = useArticles();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isGeneratingArticle, setIsGeneratingArticle] = useState(false);

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

      if (error) throw error;

      toast.success("Post published successfully!");
      await fetchArticles();
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
      
      if (data?.success) {
        toast.success("Article generated successfully!");
        if (scheduleDate) {
          console.log('Response data:', data);
          // Extract post ID from the response
          const postId = data.results?.[0]?.postId;
          
          if (!postId) {
            console.error('No post ID found in response:', data);
            toast.error('Failed to schedule: Could not find the post ID');
            return;
          }
          
          // Log the post ID we found
          console.log('Found post ID:', postId);
          
          console.log('Scheduling post for:', scheduleDate, 'Post ID:', postId);
          
          // First verify the post exists
          const { data: existingPost, error: checkError } = await supabase
            .from("blog_posts")
            .select("id")
            .eq("id", postId)
            .single();
            
          if (checkError || !existingPost) {
            console.error('Post not found:', checkError || 'No post with this ID');
            toast.error('Failed to schedule: Post not found');
            return;
          }
          
          // Update the scheduling info
          const { data: updateData, error: updateError } = await supabase
            .from("blog_posts")
            .update({
              scheduled_publish_date: scheduleDate.toISOString(),
              publishing_status: 'pending'  // Use 'pending' status for scheduled posts
            })
            .eq("id", postId)
            .select()
            .single();
            
          if (updateError) {
            console.error('Failed to update scheduling:', updateError);
            toast.error('Failed to schedule post: ' + updateError.message);
          } else {
            console.log('Updated post data:', updateData);
            
            if (!updateData) {
              console.error('No data returned after update');
              toast.error('Failed to confirm scheduling update');
              return;
            }
            
            toast.success(`Article scheduled for publication on ${format(scheduleDate, "PPP 'at' p")}`);
            
            // Immediately refresh the articles list
            await fetchArticles();
            
            // Double-check the updated article
            const updatedArticle = articles.find(a => a.id === postId);
            console.log('Updated article state:', {
              id: postId,
              status: updatedArticle?.publishing_status,
              scheduledDate: updatedArticle?.scheduled_publish_date
            });
          }
          
        } else if (data.results?.[0]?.success) {
          toast.info("Article published to WordPress!");
        } else {
          toast.warning(`Article created but publishing failed: ${data.results?.[0]?.error}`);
        }
      } else {
        toast.warning("Article generation completed with issues");
      }
      
      await fetchArticles();
    } catch (error: any) {
      console.error('Article generation error:', error);
      toast.error(error.message || "Failed to generate article");
    } finally {
      setIsGeneratingArticle(false);
    }
  };

  if (isLoading) {
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
              Your AI engine is ready! Posts will be generated automatically based on your settings.
            </p>
            <Button onClick={() => navigate("/")}>
              Go to Dashboard
            </Button>
          </div>
        </Card>
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
            {scheduledPosts.length} scheduled · {pendingPosts.length} pending · {publishedPosts.length} published · {failedPosts.length} failed
          </p>
        </div>
        <Button 
          onClick={() => setShowGenerateDialog(true)}
          disabled={isGeneratingArticle || !blogId}
        >
          {isGeneratingArticle && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <FileText className="w-4 h-4 mr-2" />
          Generate New Article
        </Button>
        
        <GenerateArticleDialog
          open={showGenerateDialog}
          onOpenChange={setShowGenerateDialog}
          onGenerate={handleGenerateArticle}
          isGenerating={isGeneratingArticle}
        />
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
          <Calendar className="w-6 h-6 text-purple-600" />
          Scheduled Posts
          <Badge variant="secondary" className="bg-purple-600 text-white">
            {scheduledPosts.length}
          </Badge>
        </h2>
        <div className="grid gap-4">
          {scheduledPosts.length === 0 ? (
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
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {post.scheduled_publish_date ? 
                            `Scheduled for ${format(parseISO(post.scheduled_publish_date), "PPP 'at' p")}` :
                            'Not scheduled'
                          }
                        </span>
                      </div>
                      <span>Created {format(new Date(post.created_at), 'MMM d, yyyy')}</span>
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
      </div>

      {pendingPosts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-6 h-6 text-blue-600" />
            Pending Posts
            <Badge variant="secondary" className="bg-blue-600 text-white">
              {pendingPosts.length}
            </Badge>
          </h2>
          <div className="grid gap-4">
            {pendingPosts.map((post, index) => {
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
                          onClick={() => navigate(`/blog/${post.slug}`)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
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
        </div>
      )}

      {publishedPosts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-6 h-6 text-green-600" />
            Published Posts
            <Badge variant="default" className="bg-green-600">
              {publishedPosts.length}
            </Badge>
          </h2>
          <div className="grid gap-4">
            {publishedPosts.map((post) => (
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
                          External ID: {post.external_post_id}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2">
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
        </div>
      )}

      {failedPosts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-red-600" />
            Failed Posts
            <Badge variant="destructive">
              {failedPosts.length}
            </Badge>
          </h2>
          <div className="grid gap-4">
            {failedPosts.map((post) => (
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
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="default"
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
        </div>
      )}

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