import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface EditArticleDialogProps {
  articleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface ArticleData {
  title: string;
  content: string;
  meta_title: string | null;
  meta_description: string | null;
  excerpt: string | null;
}

export function EditArticleDialog({ articleId, open, onOpenChange, onSaved }: EditArticleDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [articleData, setArticleData] = useState<ArticleData>({
    title: "",
    content: "",
    meta_title: "",
    meta_description: "",
    excerpt: "",
  });

  useEffect(() => {
    if (articleId && open) {
      fetchArticle();
    }
  }, [articleId, open]);

  const fetchArticle = async () => {
    if (!articleId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("title, content, meta_title, meta_description, excerpt")
        .eq("id", articleId)
        .single();

      if (error) throw error;

      setArticleData({
        title: data.title || "",
        content: data.content || "",
        meta_title: data.meta_title || "",
        meta_description: data.meta_description || "",
        excerpt: data.excerpt || "",
      });
    } catch (error) {
      console.error("Error fetching article:", error);
      toast.error("Failed to load article");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!articleId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("blog_posts")
        .update({
          title: articleData.title,
          content: articleData.content,
          meta_title: articleData.meta_title || null,
          meta_description: articleData.meta_description || null,
          excerpt: articleData.excerpt || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", articleId);

      if (error) throw error;

      toast.success("Article updated successfully!");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving article:", error);
      toast.error("Failed to save article");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Article</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={articleData.title}
                onChange={(e) => setArticleData({ ...articleData, title: e.target.value })}
                placeholder="Article title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meta_title">Meta Title (SEO)</Label>
              <Input
                id="meta_title"
                value={articleData.meta_title || ""}
                onChange={(e) => setArticleData({ ...articleData, meta_title: e.target.value })}
                placeholder="SEO title (optional)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meta_description">Meta Description (SEO)</Label>
              <Textarea
                id="meta_description"
                value={articleData.meta_description || ""}
                onChange={(e) => setArticleData({ ...articleData, meta_description: e.target.value })}
                placeholder="SEO description (optional)"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea
                id="excerpt"
                value={articleData.excerpt || ""}
                onChange={(e) => setArticleData({ ...articleData, excerpt: e.target.value })}
                placeholder="Article excerpt (optional)"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={articleData.content}
                onChange={(e) => setArticleData({ ...articleData, content: e.target.value })}
                placeholder="Article content"
                rows={15}
                className="font-mono text-sm"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
