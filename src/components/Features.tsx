import { Sparkles, TrendingUp, Zap, Target, FileText, BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Features = () => {
  const features = [
    {
      icon: TrendingUp,
      title: "Instant SEO Analysis",
      description: "Get a comprehensive analysis of your website's SEO health in seconds, powered by AI.",
    },
    {
      icon: Target,
      title: "Keyword Opportunities",
      description: "Discover high-value keywords your competitors are missing with advanced search intent analysis.",
    },
    {
      icon: Sparkles,
      title: "AI Content Generation",
      description: "Generate SEO-optimized articles that rank higher with our advanced AI writing assistant.",
    },
    {
      icon: Zap,
      title: "One-Click Publishing",
      description: "Publish directly to WordPress, Webflow, or Framer with a single click. No manual copying.",
    },
    {
      icon: FileText,
      title: "Content Strategy",
      description: "Get a personalized content calendar based on your website's unique opportunities.",
    },
    {
      icon: BarChart3,
      title: "Traffic Insights",
      description: "Track your keyword rankings and see the estimated value of increased organic traffic.",
    },
  ];

  return (
    <section className="py-24 bg-background relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Features you will love.
          </h2>
          <p className="text-lg text-muted-foreground">
            Everything you need to dominate search rankings and drive organic traffic to your website.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="p-6 hover:shadow-xl transition-all duration-300 bg-card/50 backdrop-blur-sm border-2 hover:border-accent/30 group"
            >
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                <feature.icon className="w-7 h-7 text-accent" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
