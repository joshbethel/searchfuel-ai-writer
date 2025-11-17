import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Code2, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  publishing_status?: string | null;
  external_post_id?: string | null;
}

export function EditArticleDialog({ articleId, open, onOpenChange, onSaved }: EditArticleDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [updateToCms, setUpdateToCms] = useState(false);
  const [contentMode, setContentMode] = useState<"visual" | "text">("text");
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
        .select("title, content, meta_title, meta_description, excerpt, publishing_status, external_post_id")
        .eq("id", articleId)
        .single();

      if (error) throw error;

      setArticleData({
        title: data.title || "",
        content: data.content || "",
        meta_title: data.meta_title || "",
        meta_description: data.meta_description || "",
        excerpt: data.excerpt || "",
        publishing_status: data.publishing_status,
        external_post_id: data.external_post_id,
      });
      
      // Auto-check if post is already published
      setUpdateToCms(data.publishing_status === 'published' && !!data.external_post_id);
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
      // Update database
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

      toast.success("Article updated in database!");

      // Update CMS if checkbox is checked
      if (updateToCms && articleData.publishing_status === 'published') {
        toast.info("Updating CMS...");
        
        try {
          const { error: publishError } = await supabase.functions.invoke('publish-to-cms', {
            body: { blog_post_id: articleId }
          });

          if (publishError) {
            console.error("CMS update error:", publishError);
            toast.error("Database updated but CMS update failed. Please try publishing again.");
          } else {
            toast.success("CMS updated successfully!");
          }
        } catch (cmsError) {
          console.error("CMS update error:", cmsError);
          toast.error("Database updated but CMS update failed. Please try publishing again.");
        }
      }

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
              <Label>Content</Label>
              <Tabs value={contentMode} onValueChange={(v) => setContentMode(v as "visual" | "text")} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text" className="flex items-center gap-2">
                    <Code2 className="w-4 h-4" />
                    Text Editor
                  </TabsTrigger>
                  <TabsTrigger value="visual" className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Visual Preview
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="text" className="mt-2">
                  <Textarea
                    id="content"
                    value={articleData.content}
                    onChange={(e) => setArticleData({ ...articleData, content: e.target.value })}
                    placeholder="Article content (Markdown supported)"
                    rows={15}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports Markdown formatting: **bold**, *italic*, # headings, etc.
                  </p>
                </TabsContent>
                
                <TabsContent value="visual" className="mt-2">
                  <div className="border rounded-lg p-4 min-h-[400px] max-h-[600px] overflow-y-auto bg-background prose prose-sm dark:prose-invert max-w-none">
                    {articleData.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {articleData.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground italic">No content to preview</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Switch to Text Editor to make changes
                  </p>
                </TabsContent>
              </Tabs>
            </div>

            {articleData.publishing_status === 'published' && articleData.external_post_id && (
              <div className="flex items-center space-x-2 p-4 border rounded-lg bg-muted/50">
                <Checkbox
                  id="update-cms"
                  checked={updateToCms}
                  onCheckedChange={(checked) => setUpdateToCms(checked === true)}
                />
                <div className="flex-1">
                  <Label
                    htmlFor="update-cms"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Update published post in CMS
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Push changes to your WordPress/Framer CMS after saving
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {updateToCms && articleData.publishing_status === 'published' ? 'Save & Update CMS' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
