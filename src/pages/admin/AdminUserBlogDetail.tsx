import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Edit, Save, X } from "lucide-react";
import { format } from "date-fns";

interface Blog {
  id: string;
  title: string;
  subdomain: string | null;
  custom_domain: string | null;
  description: string | null;
  is_published: boolean;
  article_types: Record<string, boolean> | null;
  created_at: string;
  updated_at: string;
}

const ARTICLE_TYPES = [
  { id: "listicle", name: "Listicle", emoji: "🔢", description: "Numbered lists highlighting benefits, features, or examples" },
  { id: "how_to", name: "How-to Guide", emoji: "📖", description: "Step-by-step tutorials teaching readers how to accomplish tasks" },
  { id: "checklist", name: "Checklist", emoji: "✅", description: "Actionable checklists helping readers prepare or optimize" },
  { id: "qa", name: "Q&A Article", emoji: "❓", description: "Question-and-answer format addressing common queries" },
  { id: "versus", name: "Versus", emoji: "⚔️", description: "Comparison articles evaluating two or more options" },
  { id: "roundup", name: "Roundup", emoji: "🎯", description: "Curated collections of tools, tactics, or resources" },
  { id: "news", name: "News", emoji: "📰", description: "Timely updates on industry news and trending topics" },
  { id: "interactive_tool", name: "Interactive Tool", emoji: "🛠️", description: "Embedded calculators, checkers, or generators" },
  { id: "advertorial", name: "Advertorial", emoji: "💼", description: "Product-focused content comparing your offering" },
];

export default function AdminUserBlogDetail() {
  const { userId, blogId } = useParams<{ userId: string; blogId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blog, setBlog] = useState<Blog | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<Blog>>({});
  const [articleTypes, setArticleTypes] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [previousValues, setPreviousValues] = useState<Partial<Blog>>({});

  useEffect(() => {
    const editParam = searchParams.get("edit");
    if (editParam === "true") {
      setIsEditMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (blogId && userId) {
      loadBlog();
    }
  }, [blogId, userId]);

  const loadBlog = async () => {
    if (!blogId || !userId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-get-user-content", {
        body: {
          target_user_id: userId,
          content_type: 'blogs',
        },
      });

      if (error) throw error;

      if (data?.success && data?.content?.blogs) {
        const foundBlog = data.content.blogs.find((b: Blog) => b.id === blogId);
        if (foundBlog) {
          setBlog(foundBlog);
          setFormData(foundBlog);
          setPreviousValues(foundBlog);
          // Initialize article types - use existing or default to all enabled
          if (foundBlog.article_types) {
            setArticleTypes(foundBlog.article_types);
          } else {
            const defaultTypes = ARTICLE_TYPES.reduce((acc, type) => {
              acc[type.id] = true;
              return acc;
            }, {} as Record<string, boolean>);
            setArticleTypes(defaultTypes);
          }
        } else {
          throw new Error("Blog not found");
        }
      } else {
        throw new Error(data?.error || "Failed to load blog");
      }
    } catch (error: any) {
      console.error("Error loading blog:", error);
      toast.error(error.message || "Failed to load blog");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!blogId || !userId) return;

    setSaving(true);
    try {
      // Ensure at least one article type is selected
      const hasSelected = Object.values(articleTypes).some(Boolean);
      if (!hasSelected) {
        toast.error("Please select at least one article type");
        setSaving(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("admin-update-user-content", {
        body: {
          target_user_id: userId,
          content_type: 'blogs',
          content_id: blogId,
          updates: {
            ...formData,
            article_types: articleTypes,
          },
          reason: reason.trim() || undefined,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Blog updated successfully");
        setIsEditMode(false);
        setPreviousValues(data.previous_values || {});
        if (data.content) {
          const updatedBlog = data.content as Blog;
          setBlog(updatedBlog);
          setFormData(updatedBlog);
          if (updatedBlog.article_types) {
            setArticleTypes(updatedBlog.article_types);
          }
        }
        setReason("");
      } else {
        throw new Error(data?.error || "Failed to update blog");
      }
    } catch (error: any) {
      console.error("Error updating blog:", error);
      toast.error(error.message || "Failed to update blog");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (blog) {
      setFormData(blog);
      setPreviousValues(blog);
      if (blog.article_types) {
        setArticleTypes(blog.article_types);
      } else {
        const defaultTypes = ARTICLE_TYPES.reduce((acc, type) => {
          acc[type.id] = true;
          return acc;
        }, {} as Record<string, boolean>);
        setArticleTypes(defaultTypes);
      }
    }
    setIsEditMode(false);
    setReason("");
  };

  const handleToggleArticleType = (typeId: string) => {
    setArticleTypes((prev) => ({
      ...prev,
      [typeId]: !prev[typeId],
    }));
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

  if (!blog) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Blog not found.</p>
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/users/${userId}/blogs`)}
              className="mt-4"
            >
              Back to Blogs
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
          onClick={() => navigate(`/admin/users/${userId}/blogs`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Blogs
        </Button>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {isEditMode ? "Edit Blog" : "Blog Details"}
            </h1>
            <p className="text-muted-foreground">{blog.title}</p>
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
              <CardTitle>Edit Blog</CardTitle>
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
                <Label htmlFor="subdomain">Subdomain</Label>
                <Input
                  id="subdomain"
                  value={formData.subdomain || ""}
                  onChange={(e) => setFormData({ ...formData, subdomain: e.target.value || null })}
                  placeholder="blog-name"
                />
              </div>

              <div>
                <Label htmlFor="custom_domain">Custom Domain</Label>
                <Input
                  id="custom_domain"
                  value={formData.custom_domain || ""}
                  onChange={(e) => setFormData({ ...formData, custom_domain: e.target.value || null })}
                  placeholder="example.com"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
                  rows={4}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_published"
                  checked={formData.is_published || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                />
                <Label htmlFor="is_published">Published</Label>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div>
                  <Label>Article Types</Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Select which article types can be generated for this blog. At least one type must be selected.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {ARTICLE_TYPES.map((type) => (
                      <div
                        key={type.id}
                        className={`border rounded-lg p-3 transition-all ${
                          articleTypes[type.id] ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id={`article-type-${type.id}`}
                            checked={articleTypes[type.id] || false}
                            onCheckedChange={() => handleToggleArticleType(type.id)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <label
                              htmlFor={`article-type-${type.id}`}
                              className="flex items-center gap-2 font-medium cursor-pointer"
                            >
                              <span className="text-xl">{type.emoji}</span>
                              <span className="text-sm">{type.name}</span>
                            </label>
                            <p className="text-xs text-muted-foreground mt-1">
                              {type.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    {Object.values(articleTypes).filter(Boolean).length} of {ARTICLE_TYPES.length} types selected
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="reason">Reason for Edit (Optional)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter a reason for this edit (e.g., 'Customer support request', 'Content update', etc.)"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  This reason will be logged in the audit trail.
                </p>
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
              <CardTitle>Blog Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Title</Label>
                <p className="font-medium">{blog.title}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Subdomain</Label>
                <p className="font-mono text-sm">
                  {blog.subdomain || <span className="text-muted-foreground">—</span>}
                </p>
              </div>

              <div>
                <Label className="text-muted-foreground">Custom Domain</Label>
                <p className="font-mono text-sm">
                  {blog.custom_domain || <span className="text-muted-foreground">—</span>}
                </p>
              </div>

              <div>
                <Label className="text-muted-foreground">Description</Label>
                <p>{blog.description || <span className="text-muted-foreground">—</span>}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Status</Label>
                <div>
                  <Badge variant={blog.is_published ? "default" : "secondary"}>
                    {blog.is_published ? "Published" : "Draft"}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Article Types</Label>
                <div className="mt-2">
                  {blog.article_types && Object.entries(blog.article_types).some(([_, enabled]) => enabled) ? (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(blog.article_types)
                        .filter(([_, enabled]) => enabled)
                        .map(([typeId, _]) => {
                          const type = ARTICLE_TYPES.find((t) => t.id === typeId);
                          return type ? (
                            <Badge key={typeId} variant="outline" className="text-sm">
                              <span className="mr-1">{type.emoji}</span>
                              {type.name}
                            </Badge>
                          ) : null;
                        })}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No article types enabled</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {blog.article_types
                      ? `${Object.values(blog.article_types).filter(Boolean).length} of ${ARTICLE_TYPES.length} types enabled`
                      : "All types enabled by default"}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Created</Label>
                <p>{format(new Date(blog.created_at), "PPp")}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Last Updated</Label>
                <p>{format(new Date(blog.updated_at), "PPp")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

