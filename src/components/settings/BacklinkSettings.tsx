import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink } from "lucide-react";

interface TargetPage {
  url: string;
  keywords: string[];
  priority: "high" | "medium" | "low";
}

interface BacklinkSettingsProps {
  blogId: string;
}

export function BacklinkSettings({ blogId }: BacklinkSettingsProps) {
  const [targetPages, setTargetPages] = useState<TargetPage[]>([]);
  const [backlinkStrategy, setBacklinkStrategy] = useState<string>("smart_contextual");
  const [maxLinks, setMaxLinks] = useState<number>(5);
  const [loading, setLoading] = useState(true);
  
  // Form state for new page
  const [newUrl, setNewUrl] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");

  useEffect(() => {
    loadSettings();
  }, [blogId]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("blogs")
        .select("target_pages, backlink_strategy, max_links_per_post")
        .eq("id", blogId)
        .single();

      if (error) throw error;

      setTargetPages((data.target_pages as unknown as TargetPage[]) || []);
      setBacklinkStrategy(data.backlink_strategy || "smart_contextual");
      setMaxLinks(data.max_links_per_post || 5);
    } catch (error) {
      console.error("Error loading backlink settings:", error);
      toast.error("Failed to load backlink settings");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPage = () => {
    if (!newUrl || !newKeywords) {
      toast.error("Please fill in all fields");
      return;
    }

    const keywords = newKeywords.split(",").map(k => k.trim()).filter(Boolean);
    
    setTargetPages([
      ...targetPages,
      {
        url: newUrl,
        keywords,
        priority: newPriority,
      }
    ]);

    // Reset form
    setNewUrl("");
    setNewKeywords("");
    setNewPriority("medium");
  };

  const handleRemovePage = (index: number) => {
    setTargetPages(targetPages.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from("blogs")
        .update({
          target_pages: targetPages as any,
          backlink_strategy: backlinkStrategy,
          max_links_per_post: maxLinks,
        })
        .eq("id", blogId);

      if (error) throw error;

      toast.success("Backlink settings saved successfully");
    } catch (error) {
      console.error("Error saving backlink settings:", error);
      toast.error("Failed to save backlink settings");
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automatic Backlink Settings</CardTitle>
        <CardDescription>
          Configure target pages and keywords for automatic backlink insertion in your blog posts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Strategy Selection */}
        <div className="space-y-2">
          <Label>Backlink Strategy</Label>
          <Select value={backlinkStrategy} onValueChange={setBacklinkStrategy}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="smart_contextual">Smart Contextual (Recommended)</SelectItem>
              <SelectItem value="homepage_only">Homepage Only</SelectItem>
              <SelectItem value="service_pages">Service Pages Focus</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Choose how backlinks are automatically inserted into your content
          </p>
        </div>

        {/* Max Links Setting */}
        <div className="space-y-2">
          <Label htmlFor="max-links">Maximum Links Per Post</Label>
          <Input
            id="max-links"
            type="number"
            min="1"
            max="10"
            value={maxLinks}
            onChange={(e) => setMaxLinks(parseInt(e.target.value) || 5)}
          />
          <p className="text-sm text-muted-foreground">
            Limit the number of automatic backlinks per post (recommended: 3-5)
          </p>
        </div>

        {/* Target Pages List */}
        <div className="space-y-4">
          <Label>Target Pages</Label>
          
          {targetPages.length > 0 && (
            <div className="space-y-3">
              {targetPages.map((page, index) => (
                <div
                  key={index}
                  className="flex items-start justify-between p-4 border rounded-lg bg-muted/50"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                      <code className="text-sm">{page.url}</code>
                      <Badge variant={
                        page.priority === "high" ? "default" :
                        page.priority === "medium" ? "secondary" :
                        "outline"
                      }>
                        {page.priority}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {page.keywords.map((keyword, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemovePage(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add New Page Form */}
          <div className="space-y-3 p-4 border rounded-lg border-dashed">
            <h4 className="text-sm font-medium">Add Target Page</h4>
            
            <div className="space-y-2">
              <Label htmlFor="new-url">Page URL</Label>
              <Input
                id="new-url"
                placeholder="/services or https://example.com/page"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-keywords">Keywords (comma-separated)</Label>
              <Input
                id="new-keywords"
                placeholder="installation, repair, service"
                value={newKeywords}
                onChange={(e) => setNewKeywords(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter keywords that should link to this page when mentioned in content
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-priority">Priority</Label>
              <Select value={newPriority} onValueChange={(v: any) => setNewPriority(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleAddPage} variant="outline" className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Target Page
            </Button>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave}>
            Save Backlink Settings
          </Button>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-muted rounded-lg space-y-2">
          <h4 className="text-sm font-medium">How It Works</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• AI generates content naturally mentioning your keywords</li>
            <li>• System automatically inserts links at first keyword occurrence</li>
            <li>• High priority pages get linked first</li>
            <li>• Links are distributed naturally throughout content</li>
            <li>• Respects max links limit to avoid over-optimization</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
