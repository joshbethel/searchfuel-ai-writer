import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExternalLink, LayoutGrid, Sparkles } from "lucide-react";

interface ArticleType {
  id: string;
  name: string;
  emoji: string;
  description: string;
  exampleSlug: string;
}

const ARTICLE_TYPES: ArticleType[] = [
  {
    id: "listicle",
    name: "Listicle",
    emoji: "🔢",
    description: "Numbered lists highlighting benefits, features, or examples",
    exampleSlug: "10-benefits-automated-seo-content",
  },
  {
    id: "how_to",
    name: "How-to Guide",
    emoji: "📖",
    description: "Step-by-step tutorials teaching readers how to accomplish tasks",
    exampleSlug: "how-to-set-up-seo-blog-10-minutes",
  },
  {
    id: "checklist",
    name: "Checklist",
    emoji: "✅",
    description: "Actionable checklists helping readers prepare or optimize",
    exampleSlug: "new-blog-launch-seo-checklist",
  },
  {
    id: "qa",
    name: "Q&A Article",
    emoji: "❓",
    description: "Question-and-answer format addressing common queries",
    exampleSlug: "seo-content-automation-questions-answered",
  },
  {
    id: "versus",
    name: "Versus",
    emoji: "⚔️",
    description: "Comparison articles evaluating two or more options",
    exampleSlug: "content-writer-vs-ai-automation",
  },
  {
    id: "roundup",
    name: "Roundup",
    emoji: "🎯",
    description: "Curated collections of tools, tactics, or resources",
    exampleSlug: "10-proven-seo-content-strategies-2025",
  },
  {
    id: "news",
    name: "News",
    emoji: "📰",
    description: "Timely updates on industry news and trending topics",
    exampleSlug: "google-algorithm-update-content-strategy",
  },
  {
    id: "interactive_tool",
    name: "Interactive Tool",
    emoji: "🛠️",
    description: "Embedded calculators, checkers, or generators",
    exampleSlug: "seo-blog-roi-calculator",
  },
  {
    id: "advertorial",
    name: "Advertorial",
    emoji: "💼",
    description: "Product-focused content comparing your offering",
    exampleSlug: "searchfuel-vs-traditional-content-marketing",
  },
];

interface ArticleTypeSettingsProps {
  blogId: string;
  isOnboarding?: boolean;
  onSave?: (selectedTypes: Record<string, boolean>) => void;
}

export function ArticleTypeSettings({ blogId, isOnboarding = false, onSave }: ArticleTypeSettingsProps) {
  const [selectedTypes, setSelectedTypes] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadArticleTypes();
  }, [blogId]);

  const loadArticleTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("blogs")
        .select("article_types")
        .eq("id", blogId)
        .single();

      if (error) throw error;

      if (data?.article_types) {
        setSelectedTypes(data.article_types as Record<string, boolean>);
      } else {
        // Default: all enabled
        const defaultTypes = ARTICLE_TYPES.reduce((acc, type) => {
          acc[type.id] = true;
          return acc;
        }, {} as Record<string, boolean>);
        setSelectedTypes(defaultTypes);
      }
    } catch (error) {
      console.error("Error loading article types:", error);
      toast.error("Failed to load article type preferences");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (typeId: string) => {
    setSelectedTypes((prev) => ({
      ...prev,
      [typeId]: !prev[typeId],
    }));
  };

  const handleSelectAll = () => {
    const allSelected = ARTICLE_TYPES.reduce((acc, type) => {
      acc[type.id] = true;
      return acc;
    }, {} as Record<string, boolean>);
    setSelectedTypes(allSelected);
  };

  const handleDeselectAll = () => {
    const allDeselected = ARTICLE_TYPES.reduce((acc, type) => {
      acc[type.id] = false;
      return acc;
    }, {} as Record<string, boolean>);
    setSelectedTypes(allDeselected);
  };

  const handleSave = async () => {
    // Ensure at least one type is selected
    const hasSelected = Object.values(selectedTypes).some((val) => val);
    if (!hasSelected) {
      toast.error("Please select at least one article type");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("blogs")
        .update({ article_types: selectedTypes })
        .eq("id", blogId);

      if (error) throw error;

      toast.success("Article type preferences saved");
      
      if (onSave) {
        onSave(selectedTypes);
      }
    } catch (error) {
      console.error("Error saving article types:", error);
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-muted-foreground">Loading article types...</p>
        </CardContent>
      </Card>
    );
  }

  const selectedCount = Object.values(selectedTypes).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-indigo-500" />
            Article Types
          </CardTitle>
          <CardDescription>
            {isOnboarding
              ? "Choose the article formats that best fit your audience. You can change this anytime in settings."
              : "Select which types of content you want automatically generated for your blog."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Selected</p>
              <p className="mt-1 text-lg font-semibold">{selectedCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Available Types</p>
              <p className="mt-1 text-lg font-semibold">{ARTICLE_TYPES.length}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Coverage</p>
              <p className="mt-1 text-lg font-semibold">
                {Math.round((selectedCount / ARTICLE_TYPES.length) * 100)}%
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border bg-card p-4">
            <div className="text-sm text-muted-foreground">
              {selectedCount} of {ARTICLE_TYPES.length} types selected
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                Deselect All
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ARTICLE_TYPES.map((type) => (
              <div
                key={type.id}
                className={`group border rounded-xl p-4 transition-all ${
                  selectedTypes[type.id] ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-accent/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={type.id}
                    checked={selectedTypes[type.id] || false}
                    onCheckedChange={() => handleToggle(type.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <label
                      htmlFor={type.id}
                      className="flex items-center gap-2 font-medium cursor-pointer"
                    >
                      <span className="text-2xl">{type.emoji}</span>
                      <span>{type.name}</span>
                      {selectedTypes[type.id] ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Enabled
                        </Badge>
                      ) : null}
                    </label>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {type.description}
                    </p>
                    <a
                      href={`/blog/${type.exampleSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      View Example
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <Button
              onClick={handleSave}
              disabled={saving || selectedCount === 0}
              className="w-full min-h-10"
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  Saving...
                </span>
              ) : (
                "Save Article Type Preferences"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
