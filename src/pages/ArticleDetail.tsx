import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import KeywordPanel from '@/components/KeywordPanel';
import { ArticleStatusViewer } from '@/components/ArticleStatusViewer';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, ExternalLink, Loader2 } from "lucide-react";

interface InternalLink {
  title: string;
  url: string;
  reason: string;
}

interface ExternalLink {
  title: string;
  url: string;
  reason: string;
}

interface ArticleContent {
  seo_title: string;
  meta_description: string;
  main_content: string;
  internal_links?: InternalLink[];
  external_links?: ExternalLink[];
  social_caption: string;
}

interface Article {
  id: string;
  title: string;
  keyword: string;
  intent: string;
  content: ArticleContent;
  website_url: string;
  created_at: string;
}

export default function ArticleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) fetchArticle(id);
  }, [id]);

  const fetchArticle = async (articleId: string) => {
    try {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("id", articleId)
        .single();

      if (error) throw error;
      setArticle(data as unknown as Article);
    } catch (error) {
      console.error("Error fetching article:", error);
      toast.error("Failed to load article");
      navigate("/articles");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (article?.content.main_content) {
      navigator.clipboard.writeText(article.content.main_content);
      toast.success("Article copied to clipboard!");
    }
  };

  const handleDownload = () => {
    if (article?.content.main_content) {
      const blob = new Blob([article.content.main_content], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${article.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Article downloaded!");
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!article) return null;

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container mx-auto px-6 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <Button
            onClick={() => navigate("/articles")}
            variant="ghost"
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Articles
          </Button>

          <div className="space-y-6">
            {/* Title and Metadata */}
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                {article.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  {article.keyword}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Created: {new Date(article.created_at).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Post Status - Full Width */}
            <ArticleStatusViewer articleId={article.id} />
            
            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <Button onClick={handleCopy} variant="outline">
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
              <Button onClick={handleDownload} variant="hero">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>

        {/* SEO Metadata */}
        <Card className="p-6 mb-8 bg-card border-l-4 border-l-accent">
          <h3 className="text-lg font-bold text-foreground mb-4">SEO Metadata</h3>
          <div className="space-y-3">
            <div>
              <span className="text-sm font-semibold text-muted-foreground">Title Tag:</span>
              <p className="text-foreground">{article.content.seo_title}</p>
            </div>
            <div>
              <span className="text-sm font-semibold text-muted-foreground">Meta Description:</span>
              <p className="text-foreground">{article.content.meta_description}</p>
            </div>
          </div>
        </Card>

        {/* Article Content */}
        <Card className="p-8 mb-8 bg-card">
          <div
            className="prose prose-lg max-w-none prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-a:text-accent"
            dangerouslySetInnerHTML={{ __html: article.content.main_content }}
          />
        </Card>

        {/* Link Suggestions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Internal Links */}
          <Card className="p-6 bg-card">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-accent" />
              Internal Link Suggestions
            </h3>
            <div className="space-y-3">
              {article.content.internal_links?.map((link, index) => (
                <div key={index} className="p-3 bg-secondary/50 rounded-lg">
                  <p className="text-sm font-semibold text-foreground mb-1">{link.title}</p>
                  <p className="text-xs text-muted-foreground break-all mb-2">{link.url}</p>
                  <p className="text-xs text-muted-foreground italic">{link.reason}</p>
                </div>
              )) || <p className="text-sm text-muted-foreground">No internal link suggestions available</p>}
            </div>
          </Card>

          {/* External Links */}
          <Card className="p-6 bg-card">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-accent" />
              External Backlink Suggestions
            </h3>
            <div className="space-y-3">
              {article.content.external_links?.map((link, index) => (
                <div key={index} className="p-3 bg-secondary/50 rounded-lg">
                  <p className="text-sm font-semibold text-foreground mb-1">{link.title}</p>
                  <p className="text-xs text-muted-foreground break-all mb-2">{link.url}</p>
                  <p className="text-xs text-muted-foreground italic">{link.reason}</p>
                </div>
              )) || <p className="text-sm text-muted-foreground">No external link suggestions available</p>}
            </div>
          </Card>
        </div>

        {/* Social Caption */}
        <Card className="p-6 bg-card">
          <h3 className="text-lg font-bold text-foreground mb-4">Social Media Caption</h3>
          <p className="text-foreground bg-secondary/50 p-4 rounded-lg">{article.content.social_caption}</p>
        </Card>
        
        {/* Keyword Panel */}
        <div className="mb-8">
          <KeywordPanel id={article.id} kind="article" />
        </div>
      </div>
    </div>
  );
}
