import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Edit, Save, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  blogs?: {
    id: string;
    title: string;
  };
}

export default function AdminUserBlogPostDetail() {
  const { userId, postId } = useParams<{ userId: string; postId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<BlogPost>>({});
  const [reason, setReason] = useState("");

  useEffect(() => {
    const editParam = searchParams.get("edit");
    if (editParam === "true") {
      setIsEditMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (postId && userId) {
      loadPost();
    }
  }, [postId, userId]);

  const loadPost = async () => {
    if (!postId || !userId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-get-user-content", {
        body: {
          target_user_id: userId,
          content_type: 'blog_posts',
        },
      });

      if (error) throw error;

      if (data?.success && data?.content?.blog_posts) {
        const foundPost = data.content.blog_posts.find((p: BlogPost) => p.id === postId);
        if (foundPost) {
          setPost(foundPost);
          setFormData(foundPost);
        } else {
          throw new Error("Blog post not found");
        }
      } else {
        throw new Error(data?.error || "Failed to load blog post");
      }
    } catch (error: any) {
      console.error("Error loading blog post:", error);
      toast.error(error.message || "Failed to load blog post");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!postId || !userId) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-update-user-content", {
        body: {
          target_user_id: userId,
          content_type: 'blog_posts',
          content_id: postId,
          updates: formData,
          reason: reason.trim() || undefined,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Blog post updated successfully");
        setIsEditMode(false);
        if (data.content) {
          setPost(data.content as BlogPost);
          setFormData(data.content as BlogPost);
        }
        setReason("");
      } else {
        throw new Error(data?.error || "Failed to update blog post");
      }
    } catch (error: any) {
      console.error("Error updating blog post:", error);
      toast.error(error.message || "Failed to update blog post");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (post) {
      setFormData(post);
    }
    setIsEditMode(false);
    setReason("");
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

  if (!post) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Blog post not found.</p>
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/users/${userId}/blog-posts`)}
              className="mt-4"
            >
              Back to Blog Posts
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate(`/admin/users/${userId}/blog-posts`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Blog Posts
        </Button>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {isEditMode ? "Edit Blog Post" : "Blog Post Details"}
            </h1>
            <p className="text-muted-foreground">{post.title}</p>
          </div>
          {!isEditMode && (
            <Button onClick={() => setIsEditMode(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {isEditMode ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Edit Blog Post</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title || ""}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={formData.slug || ""}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="excerpt">Excerpt</Label>
                <Textarea
                  id="excerpt"
                  value={formData.excerpt || ""}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value || null })}
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  value={formData.content || ""}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={15}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status || "draft"}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="reason">Reason for Edit (Optional)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter a reason for this edit..."
                  rows={3}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={saving}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Blog Post Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Title</Label>
                <p className="font-medium">{post.title}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Slug</Label>
                <p className="font-mono text-sm">{post.slug}</p>
              </div>

              {post.blogs && (
                <div>
                  <Label className="text-muted-foreground">Blog</Label>
                  <p>{post.blogs.title}</p>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground">Status</Label>
                <div>
                  <Badge
                    variant={
                      post.status === "published"
                        ? "default"
                        : post.status === "draft"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {post.status}
                  </Badge>
                </div>
              </div>

              {post.excerpt && (
                <div>
                  <Label className="text-muted-foreground">Excerpt</Label>
                  <p>{post.excerpt}</p>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground">Content</Label>
                <div className="mt-2 p-4 bg-muted rounded-md max-h-96 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm">{post.content}</pre>
                </div>
              </div>

              {post.published_at && (
                <div>
                  <Label className="text-muted-foreground">Published</Label>
                  <p>{format(new Date(post.published_at), "PPp")}</p>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground">Created</Label>
                <p>{format(new Date(post.created_at), "PPp")}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Last Updated</Label>
                <p>{format(new Date(post.updated_at), "PPp")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

