import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Lightbulb, ArrowRight } from "lucide-react";

interface BlogIdea {
  id: string;
  title: string;
  keyword: string;
  intent: "informational" | "commercial" | "transactional";
  reason: string;
}

interface ScanResultsProps {
  url: string;
  blogIdeas: BlogIdea[];
  onApprove: (idea: BlogIdea) => void;
  isLoading: boolean;
}

const intentColors = {
  informational: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  commercial: "bg-green-500/10 text-green-600 border-green-500/20",
  transactional: "bg-accent/10 text-accent border-accent/20",
};

const intentIcons = {
  informational: Lightbulb,
  commercial: TrendingUp,
  transactional: Target,
};

export const ScanResults = ({ url, blogIdeas, onApprove, isLoading }: ScanResultsProps) => {
  return (
    <div className="min-h-screen bg-background py-20">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="max-w-4xl mx-auto mb-12 text-center">
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Analysis Complete for{" "}
            <span className="text-accent">{new URL(url).hostname}</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            We've identified {blogIdeas.length} high-potential blog topics to boost your rankings and drive conversions.
          </p>
        </div>

        {/* Blog Ideas Grid */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {blogIdeas.map((idea) => {
            const IntentIcon = intentIcons[idea.intent];
            return (
              <Card
                key={idea.id}
                className="p-6 hover:shadow-lg transition-all duration-300 border-2 hover:border-accent/50 bg-gradient-to-br from-card to-card/50"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                    <IntentIcon className="w-6 h-6 text-accent" />
                  </div>
                  <div className="flex-1">
                    <Badge className={`mb-2 ${intentColors[idea.intent]}`}>
                      {idea.intent.charAt(0).toUpperCase() + idea.intent.slice(1)} Intent
                    </Badge>
                    <h3 className="text-xl font-bold text-foreground mb-2 line-clamp-2">
                      {idea.title}
                    </h3>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-muted-foreground">Target Keyword:</span>
                    <Badge variant="outline" className="font-mono">
                      {idea.keyword}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {idea.reason}
                  </p>
                </div>

                <Button
                  onClick={() => onApprove(idea)}
                  disabled={isLoading}
                  variant="hero"
                  className="w-full group"
                >
                  Generate Article
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
