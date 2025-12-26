import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, TrendingUp, FileText, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompetitorAnalysisPanelProps {
  analysis: any;
  contentScore?: number;
  scoreFactors?: any;
}

export function CompetitorAnalysisPanel({ 
  analysis, 
  contentScore, 
  scoreFactors 
}: CompetitorAnalysisPanelProps) {
  if (!analysis) return null;

  const insights = analysis.insights || {};

  return (
    <div className="space-y-4">
      {/* Content Score */}
      {contentScore !== undefined && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Content Quality Score: {contentScore}/100
            </CardTitle>
            <CardDescription>
              How your content compares to top-ranking pages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Score Bar */}
              <div className="w-full bg-secondary rounded-full h-3">
                <div
                  className={cn(
                    "h-3 rounded-full transition-all",
                    contentScore >= 80 ? "bg-green-500" :
                    contentScore >= 60 ? "bg-yellow-500" :
                    "bg-red-500"
                  )}
                  style={{ width: `${contentScore}%` }}
                />
              </div>

              {/* Score Breakdown */}
              {scoreFactors && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Word Count: </span>
                    <span className="font-medium">{scoreFactors.word_count_score}/100</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Headings: </span>
                    <span className="font-medium">{scoreFactors.heading_structure_score}/100</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Keyword Opt: </span>
                    <span className="font-medium">{scoreFactors.keyword_optimization_score}/100</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Readability: </span>
                    <span className="font-medium">{scoreFactors.readability_score}/100</span>
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {contentScore < 80 && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Recommendations:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {scoreFactors?.word_count_score < 80 && (
                      <li>• Increase word count to {insights.recommended_word_count || 2000}+ words</li>
                    )}
                    {scoreFactors?.heading_structure_score < 80 && (
                      <li>• Add more H2 and H3 subheadings</li>
                    )}
                    {scoreFactors?.keyword_optimization_score < 80 && (
                      <li>• Improve keyword density and placement</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Competitor Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Competitor Analysis
          </CardTitle>
          <CardDescription>
            Top-ranking pages for "{analysis.keyword}"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">Avg Word Count</div>
              <div className="text-2xl font-bold">{insights.avg_word_count?.toLocaleString() || 'N/A'}</div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">Recommended</div>
              <div className="text-2xl font-bold">{insights.recommended_word_count?.toLocaleString() || 'N/A'}</div>
            </div>
            {insights.volume && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Search Volume</div>
                <div className="text-2xl font-bold">{insights.volume.toLocaleString()}</div>
              </div>
            )}
            {insights.difficulty !== undefined && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Difficulty</div>
                <div className={cn(
                  "text-2xl font-bold",
                  insights.difficulty <= 20 ? "text-green-600" :
                  insights.difficulty <= 40 ? "text-yellow-600" :
                  "text-red-600"
                )}>
                  {insights.difficulty}
                </div>
              </div>
            )}
          </div>

          {/* Top URLs */}
          {analysis.top_urls && analysis.top_urls.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Top Ranking Pages:</h4>
              <div className="space-y-2">
                {analysis.top_urls.slice(0, 5).map((url: any, index: number) => (
                  <div key={index} className="flex items-start gap-2 p-2 border rounded-lg">
                    <ExternalLink className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{url.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{url.domain}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {url.word_count?.toLocaleString()} words
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Common Headings */}
          {insights.common_headings && insights.common_headings.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Common Headings:</h4>
              <div className="flex flex-wrap gap-2">
                {insights.common_headings.slice(0, 5).map((heading: string, index: number) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {heading}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

