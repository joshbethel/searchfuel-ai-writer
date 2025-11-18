import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Search, 
  Target, 
  Sparkles, 
  Zap, 
  FileText, 
  BarChart3,
  TrendingUp,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Globe,
  LineChart,
  Wand2
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Presentation() {
  const navigate = useNavigate();

  const features = [
    {
      icon: Search,
      title: "Instant SEO Analysis",
      description: "Scan any website and get comprehensive SEO health insights in seconds. Identify what's working and what needs improvement.",
      benefit: "Save hours of manual SEO auditing",
    },
    {
      icon: Target,
      title: "Keyword Opportunities",
      description: "Discover high-value keywords your competitors are missing. Advanced AI analyzes search intent to find content gaps.",
      benefit: "Target keywords with lower competition and higher ROI",
    },
    {
      icon: Sparkles,
      title: "AI Content Generation",
      description: "Generate SEO-optimized articles that rank. Our AI creates engaging, well-structured content tailored to your audience.",
      benefit: "Produce quality content 10x faster than manual writing",
    },
    {
      icon: Zap,
      title: "One-Click Publishing",
      description: "Publish directly to WordPress, Webflow, or Framer. No copy-pasting, no formatting issues, no hassle.",
      benefit: "Eliminate manual publishing workflow",
    },
    {
      icon: Calendar,
      title: "Content Calendar",
      description: "Schedule articles in advance with smart auto-posting. Never miss your content schedule again.",
      benefit: "Maintain consistent publishing rhythm automatically",
    },
    {
      icon: BarChart3,
      title: "Performance Tracking",
      description: "Monitor keyword rankings, traffic growth, and estimated SEO value. See exactly what content drives results.",
      benefit: "Make data-driven content decisions",
    },
  ];

  const workflow = [
    {
      step: 1,
      icon: Globe,
      title: "Connect Your Website",
      description: "Enter your website URL and connect to your CMS platform (WordPress, Webflow, or Framer).",
    },
    {
      step: 2,
      icon: LineChart,
      title: "Analyze & Discover",
      description: "Get instant SEO analysis and discover keyword opportunities based on your niche and competitors.",
    },
    {
      step: 3,
      icon: Wand2,
      title: "Generate Content",
      description: "Use AI to create SEO-optimized articles targeting your best keyword opportunities.",
    },
    {
      step: 4,
      icon: Zap,
      title: "Publish & Track",
      description: "One-click publish to your CMS and track performance with built-in analytics.",
    },
  ];

  const useCases = [
    {
      role: "Content Marketers",
      description: "Scale content production without sacrificing quality. Generate and publish 10+ articles per week.",
      result: "3x more content output with same resources",
    },
    {
      role: "SEO Agencies",
      description: "Manage multiple client websites efficiently. Automated keyword research and content creation for all clients.",
      result: "Handle 5x more clients with existing team",
    },
    {
      role: "Business Owners",
      description: "Improve organic traffic without hiring a content team. AI handles research, writing, and publishing.",
      result: "Reduce content costs by 80% while growing traffic",
    },
    {
      role: "Bloggers",
      description: "Focus on your expertise while AI handles SEO optimization. Consistent posting schedule without burnout.",
      result: "Grow audience 5x faster with strategic content",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-20 px-6 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="container mx-auto text-center max-w-4xl">
          <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6">
            AI-Powered SEO Content Platform
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            From keyword research to publishing - automate your entire content workflow and dominate search rankings
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/auth")} className="h-14 px-8">
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/dashboard")} className="h-14 px-8">
              View Dashboard Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-20 px-6">
        <div className="container mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">
              Everything You Need to Rank Higher
            </h2>
            <p className="text-lg text-muted-foreground">
              Complete SEO content solution - from research to publishing
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {features.map((feature, index) => (
              <Card key={index} className="p-6 hover:shadow-xl transition-all duration-300 border-2">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground mb-3">
                  {feature.description}
                </p>
                <div className="flex items-start gap-2 bg-primary/5 p-3 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-medium text-primary">
                    {feature.benefit}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground">
              Simple 4-step process to start ranking higher
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
            {workflow.map((step, index) => (
              <div key={index} className="relative">
                <Card className="p-6 h-full">
                  <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xl font-bold shadow-lg">
                    {step.step}
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 mt-4">
                    <step.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {step.description}
                  </p>
                </Card>
                {index < workflow.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 px-6">
        <div className="container mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">
              Who Benefits?
            </h2>
            <p className="text-lg text-muted-foreground">
              Trusted by content teams, agencies, and businesses worldwide
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {useCases.map((useCase, index) => (
              <Card key={index} className="p-8 hover:shadow-xl transition-all duration-300">
                <h3 className="text-2xl font-bold text-foreground mb-3">
                  {useCase.role}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {useCase.description}
                </p>
                <div className="flex items-center gap-2 bg-accent/10 p-4 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-accent flex-shrink-0" />
                  <p className="font-semibold text-accent">
                    {useCase.result}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-gradient-to-br from-accent/10 via-primary/5 to-background">
        <div className="container mx-auto text-center max-w-4xl">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Ready to Transform Your Content Strategy?
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Join thousands of businesses growing their organic traffic with AI
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="h-14 px-8">
              <Sparkles className="mr-2 h-5 w-5" />
              Start Free Trial
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/plans")} className="h-14 px-8">
              View Pricing
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
