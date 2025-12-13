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

interface Article {
  id: string;
  title: string;
  keyword: string;
  intent: string;
  status: string;
  content: any; // JSONB
  created_at: string;
  updated_at: string;
}

export default function AdminUserArticleDetail() {
  const { userId, articleId } = useParams<{ userId: string; articleId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [article, setArticle] = useState<Article | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<Article>>({});
  const [reason, setReason] = useState("");

  useEffect(() => {
    const editParam = searchParams.get("edit");
    if (editParam === "true") {
      setIsEditMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (articleId && userId) {
      loadArticle();
    }
  }, [articleId, userId]);

  const loadArticle = async () => {
    if (!articleId || !userId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-get-user-content", {
        body: {
          target_user_id: userId,
          content_type: 'articles',
          minimal_fields: false, // Need all fields for detail view
          filters: {
            content_id: articleId, // Only fetch the specific article
          },
        },
      });

      if (error) throw error;

      if (data?.success && data?.content?.articles && data.content.articles.length > 0) {
        const foundArticle = data.content.articles[0];
        setArticle(foundArticle);
        setFormData(foundArticle);
      } else {
        throw new Error(data?.error || "Article not found");
      }
    } catch (error: any) {
      console.error("Error loading article:", error);
      toast.error(error.message || "Failed to load article");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!articleId || !userId) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-update-user-content", {
        body: {
          target_user_id: userId,
          content_type: 'articles',
          content_id: articleId,
          updates: formData,
          reason: reason.trim() || undefined,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Article updated successfully");
        setIsEditMode(false);
        if (data.content) {
          setArticle(data.content as Article);
          setFormData(data.content as Article);
        }
        setReason("");
      } else {
        throw new Error(data?.error || "Failed to update article");
      }
    } catch (error: any) {
      console.error("Error updating article:", error);
      toast.error(error.message || "Failed to update article");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (article) {
      setFormData(article);
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

  if (!article) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Article not found.</p>
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/users/${userId}/articles`)}
              className="mt-4"
            >
              Back to Articles
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
          onClick={() => navigate(`/admin/users/${userId}/articles`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Articles
        </Button>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {isEditMode ? "Edit Article" : "Article Details"}
            </h1>
            <p className="text-muted-foreground">{article.title}</p>
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
              <CardTitle>Edit Article</CardTitle>
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
                <Label htmlFor="keyword">Keyword</Label>
                <Input
                  id="keyword"
                  value={formData.keyword || ""}
                  onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="intent">Intent</Label>
                <Input
                  id="intent"
                  value={formData.intent || ""}
                  onChange={(e) => setFormData({ ...formData, intent: e.target.value })}
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
              <CardTitle>Article Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Title</Label>
                <p className="font-medium">{article.title}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Keyword</Label>
                <Badge variant="outline">{article.keyword}</Badge>
              </div>

              <div>
                <Label className="text-muted-foreground">Intent</Label>
                <Badge variant="secondary">{article.intent}</Badge>
              </div>

              <div>
                <Label className="text-muted-foreground">Status</Label>
                <div>
                  <Badge variant={article.status === "published" ? "default" : "secondary"}>
                    {article.status}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Content (JSON)</Label>
                <div className="mt-2 p-4 bg-muted rounded-md max-h-96 overflow-y-auto">
                  <pre className="text-xs">{JSON.stringify(article.content, null, 2)}</pre>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Created</Label>
                <p>{format(new Date(article.created_at), "PPp")}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Last Updated</Label>
                <p>{format(new Date(article.updated_at), "PPp")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

