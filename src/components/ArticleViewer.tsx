import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, ExternalLink, ArrowLeft, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { autoScheduleKeyword } from "@/lib/utils/auto-schedule";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface InternalLink {
  anchorText: string;
  targetUrl: string;
}

interface ExternalLink {
  anchorText: string;
  targetUrl: string;
  reason: string;
}

interface GeneratedArticle {
  title: string;
  metaDescription: string;
  content: string;
  keyword: string;
  internalLinks: InternalLink[];
  externalLinks: ExternalLink[];
  socialCaption: string;
}

interface ArticleViewerProps {
  article: GeneratedArticle;
  onBack: () => void;
}

export const ArticleViewer = ({ article, onBack }: ArticleViewerProps) => {
  const [schedulingKeywords, setSchedulingKeywords] = useState<Set<string>>(new Set());
  const [scheduledKeywords, setScheduledKeywords] = useState<Set<string>>(new Set());

  // Fetch scheduled keywords
  useEffect(() => {
    fetchScheduledKeywords();
  }, []);

  const fetchScheduledKeywords = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: blog } = await supabase
        .from("blogs")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!blog) return;

      const { data: scheduled } = await supabase
        .from("scheduled_keywords")
        .select("keyword")
        .eq("blog_id", blog.id)
        .eq("status", "pending");

      if (scheduled) {
        setScheduledKeywords(new Set(scheduled.map(s => s.keyword.toLowerCase())));
      }
    } catch (error) {
      console.error("Error fetching scheduled keywords:", error);
    }
  };

  const handleScheduleKeyword = async (keyword: string) => {
    setSchedulingKeywords(prev => new Set(prev).add(keyword));
    
    const result = await autoScheduleKeyword(keyword);
    
    setSchedulingKeywords(prev => {
      const next = new Set(prev);
      next.delete(keyword);
      return next;
    });

    if (result.success && result.date) {
      setScheduledKeywords(prev => new Set(prev).add(keyword.toLowerCase()));
      toast.success(`Added "${keyword}" to calendar for ${format(result.date, 'MMM d, yyyy')}`);
    } else {
      toast.error(result.error || "Failed to add to calendar");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(article.content);
    toast.success("Article copied to clipboard!");
  };

  const handleDownload = () => {
    const blob = new Blob([article.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${article.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Article downloaded!");
  };

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="container mx-auto px-6 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <Button
            onClick={onBack}
            variant="ghost"
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Results
          </Button>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {article.title}
              </h1>
              <Badge variant="outline" className="font-mono">
                Target: {article.keyword}
              </Badge>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleCopy} variant="outline">
                <Copy className="w-4 h-4" />
                Copy
              </Button>
              <Button onClick={handleDownload} variant="hero">
                <Download className="w-4 h-4" />
                Download
              </Button>
            </div>
          </div>
        </div>

        {/* SEO Metadata */}
        <Card className="p-6 mb-8 bg-gradient-to-br from-secondary to-secondary/50">
          <h3 className="text-lg font-bold text-foreground mb-4">SEO Metadata</h3>
          <div className="space-y-3">
            <div>
              <span className="text-sm font-semibold text-muted-foreground">Title Tag:</span>
              <p className="text-foreground">{article.title}</p>
            </div>
            <div>
              <span className="text-sm font-semibold text-muted-foreground">Meta Description:</span>
              <p className="text-foreground">{article.metaDescription}</p>
            </div>
          </div>
        </Card>

        {/* Article Content */}
        <Card className="p-8 mb-8">
          <div
            className="prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        </Card>

        {/* Link Suggestions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Internal Links */}
          <Card className="p-6">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-accent" />
              Internal Link Suggestions
            </h3>
            <div className="space-y-3">
              {article.internalLinks.map((link, index) => (
                <div key={index} className="p-3 bg-secondary rounded-lg">
                  <p className="text-sm font-semibold text-foreground mb-1">{link.anchorText}</p>
                  <p className="text-xs text-muted-foreground break-all">{link.targetUrl}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* External Links */}
          <Card className="p-6">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-accent" />
              External Backlink Suggestions
            </h3>
            <div className="space-y-3">
              {article.externalLinks.map((link, index) => (
                <div key={index} className="p-3 bg-secondary rounded-lg">
                  <p className="text-sm font-semibold text-foreground mb-1">{link.anchorText}</p>
                  <p className="text-xs text-muted-foreground break-all mb-2">{link.targetUrl}</p>
                  <p className="text-xs text-muted-foreground italic">{link.reason}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Social Caption */}
        <Card className="p-6 mb-8">
          <h3 className="text-lg font-bold text-foreground mb-4">Social Media Caption</h3>
          <p className="text-foreground bg-secondary p-4 rounded-lg">{article.socialCaption}</p>
        </Card>

        {/* Suggested Topics/Keywords - Schedule to Calendar */}
        <Card className="p-6">
          <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent" />
            Add Topics to Calendar
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add related keywords to your content calendar - they'll be scheduled automatically
          </p>
          <div className="flex flex-wrap gap-2">
            {[article.keyword].map((keyword, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleScheduleKeyword(keyword)}
                disabled={scheduledKeywords.has(keyword.toLowerCase()) || schedulingKeywords.has(keyword)}
                className={cn(
                  "flex items-center gap-2 transition-colors",
                  scheduledKeywords.has(keyword.toLowerCase())
                    ? "text-green-600 dark:text-green-400 cursor-not-allowed"
                    : ""
                )}
                title={scheduledKeywords.has(keyword.toLowerCase()) ? "Already scheduled" : "Add to Calendar"}
              >
                {schedulingKeywords.has(keyword) ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Calendar className="w-3 h-3" />
                )}
                Add to Calendar
              </Button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
