import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BlogPost {
  id: string;
  title: string;
  publishing_status: 'pending' | 'scheduled' | 'publishing' | 'published' | 'failed' | null;
  created_at: string;
  status: string;
  scheduled_for: string | null;
  last_published_at: string | null;
  external_post_id?: string | null;
  external_post_url?: string | null;
}

export function PostStatusViewer() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    loadAllPosts();
  }, []);

  const loadAllPosts = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: blog } = await supabase
        .from("blogs")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!blog) return;

      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, publishing_status, created_at, status, scheduled_for, last_published_at, external_post_id, external_post_url")
        .eq("blog_id", blog.id)
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Use type assertion to handle the database response
      type DBBlogPost = {
        id: string;
        title: string;
        publishing_status: BlogPost['publishing_status'];
        created_at: string;
        status: string;
        scheduled_for: string | null;
        last_published_at: string | null;
        external_post_id: string | null;
        external_post_url: string | null;
      };
      
      const formattedPosts = ((data || []) as unknown as DBBlogPost[]).map(post => ({
        ...post,
        publishing_status: post.publishing_status || null
      }));
      
      setPosts(formattedPosts);
    } catch (error: any) {
      toast.error("Failed to load posts: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const generateTestPost = async () => {
    setIsGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: blog } = await supabase
        .from("blogs")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!blog) {
        toast.error("No blog found. Please set up your blog first.");
        return;
      }

      toast.info("Generating test article... This may take a minute.");

      const { data, error } = await supabase.functions.invoke('generate-blog-post', {
        body: { blogId: blog.id }
      });

      if (error) throw error;

      toast.success("Test article generated! Check the list below.");
      await loadAllPosts();
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error("Failed to generate article: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const resetPostStatus = async (postId: string) => {
    try {
      const { error } = await supabase
        .from("blog_posts")
        .update({ 
          publishing_status: 'pending',
          external_post_id: null,
          last_published_at: null
        })
        .eq("id", postId);

      if (error) throw error;
      
      toast.success("Post status reset to pending");
      await loadAllPosts();
    } catch (error: any) {
      toast.error("Failed to reset status: " + error.message);
    }
  };

  const getStatusDisplay = (post: BlogPost) => {
    const status = post.publishing_status || 'null';
    let color = '';
    let icon = '';
    
    switch (status) {
      case 'scheduled':
        color = 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800';
        icon = '🕒';
        break;
      case 'pending':
        color = 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800';
        icon = '⌛';
        break;
      case 'published':
        color = 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-800';
        icon = '✅';
        break;
      case 'failed':
        color = 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800';
        icon = '❌';
        break;
      case 'publishing':
        color = 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800';
        icon = '📤';
        break;
      default:
        color = 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-800';
        icon = '❔';
    }
    
    return { color: `${color} border`, icon };
  };

  return (
    <Card className="p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">📊 Post Status Viewer</h3>
        <div className="flex gap-2">
          <Button onClick={loadAllPosts} disabled={isLoading} size="sm" variant="outline">
            {isLoading ? 'Loading...' : 'Refresh Posts'}
          </Button>
          <Button onClick={generateTestPost} disabled={isGenerating} size="sm">
            {isGenerating ? 'Generating...' : 'Generate Test Post'}
          </Button>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No posts found. Click "Generate Test Post" to create one.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-60 overflow-y-auto">
          {posts.map((post) => {
            const status = getStatusDisplay(post);
            return (
              <div key={post.id} 
                className={`flex items-center justify-between p-4 rounded-lg bg-card/50 border-2 hover:shadow-md transition-all duration-300 ${
                  post.publishing_status === 'scheduled' ? 'border-purple-200 dark:border-purple-800/30' :
                  post.publishing_status === 'published' ? 'border-green-200 dark:border-green-800/30' :
                  'border-muted'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm mb-1 truncate">{post.title}</h4>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(post.created_at).toLocaleDateString()}
                    </p>
                    {post.scheduled_for && (
                      <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                        Scheduled: {new Date(post.scheduled_for).toLocaleString()}
                      </p>
                    )}
                    {post.last_published_at && (
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                        Published: {new Date(post.last_published_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <Badge className={status.color}>
                    <span className="mr-1">{status.icon}</span>
                    {post.publishing_status || 'null'}
                  </Badge>
                  {post.publishing_status !== 'pending' && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => resetPostStatus(post.id)}
                      className="hover:bg-muted/50"
                    >
                      Reset to Pending
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-sm">
        <p className="font-semibold mb-2">Status Guide:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800 border">
              <span className="mr-1">🕒</span> scheduled
            </Badge>
            <p className="text-xs text-muted-foreground">Post is scheduled for future publication</p>
          </div>
          <div className="space-y-2">
            <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800 border">
              <span className="mr-1">⌛</span> pending
            </Badge>
            <p className="text-xs text-muted-foreground">Ready to publish to WordPress</p>
          </div>
          <div className="space-y-2">
            <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-800 border">
              <span className="mr-1">✅</span> published
            </Badge>
            <p className="text-xs text-muted-foreground">Successfully published to WordPress</p>
          </div>
          <div className="space-y-2">
            <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800 border">
              <span className="mr-1">📤</span> publishing
            </Badge>
            <p className="text-xs text-muted-foreground">Currently being published</p>
          </div>
          <div className="space-y-2">
            <Badge className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800 border">
              <span className="mr-1">❌</span> failed
            </Badge>
            <p className="text-xs text-muted-foreground">Publishing failed, can retry</p>
          </div>
          <div className="space-y-2">
            <Badge className="bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-800 border">
              <span className="mr-1">❔</span> null
            </Badge>
            <p className="text-xs text-muted-foreground">No publishing status set</p>
          </div>
        </div>
      </div>
    </Card>
  );
}