import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function PostStatusViewer() {
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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
        .select("id, title, publishing_status, created_at, status")
        .eq("blog_id", blog.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'published': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'publishing': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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
          {posts.map((post) => (
            <div key={post.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium text-sm">{post.title}</h4>
                <p className="text-xs text-muted-foreground">
                  Created: {new Date(post.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={getStatusColor(post.publishing_status || 'null')}>
                  {post.publishing_status || 'null'}
                </Badge>
                {post.publishing_status !== 'pending' && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => resetPostStatus(post.id)}
                  >
                    Reset to Pending
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-sm text-muted-foreground">
        <p><strong>Status meanings:</strong></p>
        <ul className="text-xs mt-1">
          <li>• <strong>pending</strong> - Ready to publish to WordPress</li>
          <li>• <strong>published</strong> - Successfully published to WordPress</li>
          <li>• <strong>failed</strong> - Publishing failed, can retry</li>
          <li>• <strong>publishing</strong> - Currently being published</li>
          <li>• <strong>null</strong> - No publishing status set</li>
        </ul>
      </div>
    </Card>
  );
}