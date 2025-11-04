import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function PostContentInspector() {
  const [posts, setPosts] = useState<any[]>([]);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .limit(5)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error: any) {
      toast.error("Failed to load posts: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const inspectPost = (post: any) => {
    setSelectedPost(post);
  };

  const testWordPressPayload = () => {
    if (!selectedPost) return;

    const wordpressPayload = {
      title: selectedPost.title,
      content: selectedPost.content,
      excerpt: selectedPost.excerpt || "",
      status: "publish",
    };

    console.log("WordPress Payload:", wordpressPayload);
    console.log("Title type:", typeof selectedPost.title);
    console.log("Content type:", typeof selectedPost.content);
    console.log("Content preview:", selectedPost.content?.substring(0, 200));
    
    toast.info("Check console for WordPress payload details");
  };

  useEffect(() => {
    loadPosts();
  }, []);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Post Content Inspector</CardTitle>
        <CardDescription>
          Inspect blog post data structure before WordPress publishing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={loadPosts} disabled={loading}>
          {loading ? "Loading..." : "Reload Posts"}
        </Button>
        
        <div className="space-y-2">
          <h3 className="font-semibold">Recent Posts:</h3>
          {posts.map((post) => (
            <div key={post.id} className="flex items-center justify-between p-2 border rounded">
              <div>
                <div className="font-medium">{post.title}</div>
                <div className="text-sm text-muted-foreground">
                  Type: {typeof post.title} | Content: {typeof post.content}
                </div>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => inspectPost(post)}
              >
                Inspect
              </Button>
            </div>
          ))}
        </div>

        {selectedPost && (
          <div className="mt-4 p-4 border rounded space-y-2">
            <h3 className="font-semibold">Selected Post Details:</h3>
            <div>
              <strong>Title:</strong> {JSON.stringify(selectedPost.title)}
            </div>
            <div>
              <strong>Content Preview:</strong>
              <div className="text-sm bg-gray-100 p-2 rounded max-h-32 overflow-y-auto">
                {JSON.stringify(selectedPost.content).substring(0, 500)}...
              </div>
            </div>
            <div>
              <strong>Excerpt:</strong> {JSON.stringify(selectedPost.excerpt)}
            </div>
            <Button onClick={testWordPressPayload}>
              Test WordPress Payload
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}