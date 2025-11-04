import { Search, Sparkles, Send, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export const HowItWorks = () => {
  const steps = [
    {
      number: "01",
      icon: Search,
      title: "Analyze Your Site",
      description: "Enter your website URL and let our AI scan your content and identify SEO opportunities.",
    },
    {
      number: "02",
      icon: Sparkles,
      title: "Generate Content",
      description: "Our AI creates SEO-optimized articles targeting high-value keywords specific to your niche.",
    },
    {
      number: "03",
      icon: Send,
      title: "Publish & Rank",
      description: "Publish directly to your CMS with one click and watch your search rankings climb.",
    },
  ];

  return (
    <section className="py-24 bg-gradient-to-br from-primary/5 via-background to-accent/5 relative overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            How it works
          </h2>
          <p className="text-lg text-muted-foreground">
            Start ranking higher in search results in three simple steps
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connection lines for desktop */}
            <div className="hidden md:block absolute top-24 left-0 right-0 h-0.5 bg-gradient-to-r from-accent/20 via-accent/50 to-accent/20" />
            
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border-2 hover:border-accent/30 transition-all duration-300 relative z-10">
                  <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
                    <step.icon className="w-8 h-8 text-accent" />
                  </div>
                  <div className="text-5xl font-bold text-accent/20 mb-4">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </Card>
                
                {/* Arrow between steps */}
                {index < steps.length - 1 && (
                  <div className="hidden md:flex absolute top-24 -right-4 z-20 w-8 h-8 bg-background rounded-full items-center justify-center">
                    <ArrowRight className="w-5 h-5 text-accent" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
