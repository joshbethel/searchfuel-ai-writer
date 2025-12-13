import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Eye, Edit, BookOpen, Settings } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export default function AdminUserBlogs() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [articleTypesDialogOpen, setArticleTypesDialogOpen] = useState(false);
  const [selectedBlog, setSelectedBlog] = useState<Blog | null>(null);
  const [articleTypes, setArticleTypes] = useState<Record<string, boolean>>({});
  const [loadingArticleTypes, setLoadingArticleTypes] = useState(false);
  const [savingArticleTypes, setSavingArticleTypes] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (userId) {
      loadBlogs();
    }
  }, [userId]);

  const loadBlogs = async () => {
    if (!userId) return;

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
        setBlogs(data.content.blogs);
      } else {
        throw new Error(data?.error || "Failed to load blogs");
      }
    } catch (error: any) {
      console.error("Error loading blogs:", error);
      toast.error(error.message || "Failed to load blogs");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenArticleTypesDialog = async (blog: Blog) => {
    setSelectedBlog(blog);
    setArticleTypesDialogOpen(true);
    setLoadingArticleTypes(true);
    setReason("");

    try {
      // Check if blog already has article_types loaded
      if (blog.article_types) {
        setArticleTypes(blog.article_types);
        setLoadingArticleTypes(false);
        return;
      }

      // Load current article types for this blog
      const { data, error } = await supabase.functions.invoke("admin-get-user-content", {
        body: {
          target_user_id: userId,
          content_type: 'blogs',
        },
      });

      if (error) throw error;

      if (data?.success && data?.content?.blogs) {
        const blogData = data.content.blogs.find((b: Blog) => b.id === blog.id);
        if (blogData?.article_types) {
          setArticleTypes(blogData.article_types);
        } else {
          // Default: all enabled
          const defaultTypes = ARTICLE_TYPES.reduce((acc, type) => {
            acc[type.id] = true;
            return acc;
          }, {} as Record<string, boolean>);
          setArticleTypes(defaultTypes);
        }
      } else {
        // Default: all enabled
        const defaultTypes = ARTICLE_TYPES.reduce((acc, type) => {
          acc[type.id] = true;
          return acc;
        }, {} as Record<string, boolean>);
        setArticleTypes(defaultTypes);
      }
    } catch (error: any) {
      console.error("Error loading article types:", error);
      toast.error("Failed to load article types");
      // Default: all enabled
      const defaultTypes = ARTICLE_TYPES.reduce((acc, type) => {
        acc[type.id] = true;
        return acc;
      }, {} as Record<string, boolean>);
      setArticleTypes(defaultTypes);
    } finally {
      setLoadingArticleTypes(false);
    }
  };

  const handleToggleArticleType = (typeId: string) => {
    setArticleTypes((prev) => ({
      ...prev,
      [typeId]: !prev[typeId],
    }));
  };

  const handleSaveArticleTypes = async () => {
    if (!selectedBlog || !userId) return;

    // Ensure at least one article type is selected
    const hasSelected = Object.values(articleTypes).some(Boolean);
    if (!hasSelected) {
      toast.error("Please select at least one article type");
      return;
    }

    setSavingArticleTypes(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-update-user-content", {
        body: {
          target_user_id: userId,
          content_type: 'blogs',
          content_id: selectedBlog.id,
          updates: {
            article_types: articleTypes,
          },
          reason: reason || undefined,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Article types updated successfully");
        setArticleTypesDialogOpen(false);
        // Reload blogs to get updated data
        loadBlogs();
      } else {
        throw new Error(data?.error || "Failed to update article types");
      }
    } catch (error: any) {
      console.error("Error saving article types:", error);
      toast.error(error.message || "Failed to update article types");
    } finally {
      setSavingArticleTypes(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <div className="mb-4">
            <h1 className="text-3xl font-bold mb-2">User Blogs</h1>
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading blogs...</p>
            </div>
          </div>
        </div>
        <Card className="opacity-75">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Blogs</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subdomain</TableHead>
                  <TableHead>Custom Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Loading...</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-5 w-16 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                        <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="mb-4">
          <h1 className="text-3xl font-bold mb-2">User Blogs</h1>
          <p className="text-muted-foreground">
            {blogs.length} {blogs.length === 1 ? 'blog' : 'blogs'} found
          </p>
        </div>
      </div>

      {blogs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No blogs found for this user.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Blogs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subdomain</TableHead>
                  <TableHead>Custom Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blogs.map((blog) => (
                  <TableRow key={blog.id}>
                    <TableCell className="font-medium">{blog.title}</TableCell>
                    <TableCell>
                      {blog.subdomain ? (
                        <span className="font-mono text-sm">{blog.subdomain}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {blog.custom_domain ? (
                        <span className="font-mono text-sm">{blog.custom_domain}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={blog.is_published ? "default" : "secondary"}>
                        {blog.is_published ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(blog.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/admin/users/${userId}/blogs/${blog.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/admin/users/${userId}/blogs/${blog.id}?edit=true`)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenArticleTypesDialog(blog)}
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Article Types
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Article Types Dialog */}
      <Dialog open={articleTypesDialogOpen} onOpenChange={setArticleTypesDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Article Types</DialogTitle>
            <DialogDescription>
              Select which article types can be generated for <strong>{selectedBlog?.title}</strong>. At least one type must be selected.
            </DialogDescription>
          </DialogHeader>

          {loadingArticleTypes ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
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
              <div className="text-sm text-muted-foreground">
                {Object.values(articleTypes).filter(Boolean).length} of {ARTICLE_TYPES.length} types selected
              </div>

              <div>
                <Label htmlFor="reason">Reason for Update (Optional)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter a reason for this update (e.g., 'Customer support request', 'Content strategy change', etc.)"
                  rows={3}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  This reason will be logged in the audit trail.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArticleTypesDialogOpen(false)}
              disabled={savingArticleTypes}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveArticleTypes}
              disabled={savingArticleTypes || loadingArticleTypes}
            >
              {savingArticleTypes && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Article Types
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

