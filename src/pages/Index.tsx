import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { LogOut, Sparkles, TrendingUp, Zap, Target, Lightbulb, Loader2 } from "lucide-react";
import { toast } from "sonner";
import heroBackground from "@/assets/hero-background.jpg";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";
import { SocialProof } from "@/components/SocialProof";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";

interface BlogIdea {
  id: string;
  title: string;
  keyword: string;
  intent: "informational" | "commercial" | "transactional";
  reason: string;
}

interface SEOHealthCheck {
  url: string;
  blogIdeas: BlogIdea[];
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

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [url, setUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [seoResults, setSeoResults] = useState<SEOHealthCheck | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("Please enter a valid URL");
      return;
    }

    setIsScanning(true);
    setSeoResults(null);

    try {
      // Add https:// if no protocol is specified
      const formattedUrl = url.trim().match(/^https?:\/\//) 
        ? url.trim() 
        : `https://${url.trim()}`;
        
      const { data, error } = await supabase.functions.invoke("scan-website", {
        body: { url: formattedUrl },
      });

      if (error) throw error;

      if (data?.blogIdeas && data.blogIdeas.length > 0) {
        setSeoResults({
          url: formattedUrl,
          blogIdeas: data.blogIdeas,
        });
        toast.success(`Found ${data.blogIdeas.length} SEO opportunities!`);
      } else {
        toast.error("No opportunities found. Try a different URL.");
      }
    } catch (error) {
      console.error("Scan error:", error);
      toast.error("Failed to scan website. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleSignUpToGenerate = () => {
    toast.info("Sign up to generate articles from these recommendations");
    navigate("/?mode=signup");
  };

  return (
    <div className="min-h-screen">
      {/* Header with Auth Menu */}
      <header className="absolute top-0 left-0 right-0 z-20 border-b border-white/10 bg-[#1a2332] backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-white font-bold text-sm">SF</span>
            </div>
            <h1 className="text-xl font-bold text-white">SearchFuel</h1>
          </div>
          
          <nav className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/blog")} className="text-white hover:bg-white/10">
              Examples
            </Button>
            {user ? (
              <>
                <Button onClick={() => navigate("/dashboard")} variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20">
                  Dashboard
                </Button>
                <Button variant="outline" onClick={handleSignOut} className="bg-white/10 text-white border-white/20 hover:bg-white/20">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => navigate("/?mode=signin")} className="bg-white/10 text-white border-white/20 hover:bg-white/20">
                  Sign In
                </Button>
                <Button onClick={() => navigate("/?mode=signup")} className="bg-accent hover:bg-accent/90">
                  Sign Up
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section - Only show if no results */}
      {!seoResults && (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
          {/* Background with gradient overlay */}
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: `url(${heroBackground})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#151d29]" />
          
          {/* Content */}
          <div className="relative z-10 container mx-auto px-6 py-20 pt-32">
            <div className="max-w-4xl mx-auto text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent mb-8 animate-fade-in">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-semibold">AI-Powered SEO Assistant</span>
              </div>

              {/* Heading */}
              <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 animate-fade-in leading-tight">
                Boost Your Search
                <br />
                <span className="bg-gradient-to-r from-accent to-accent/80 bg-clip-text text-transparent">
                  Rankings on Autopilot
                </span>
              </h1>

              {/* Subheading */}
              <p className="text-xl md:text-2xl text-white/80 mb-12 max-w-2xl mx-auto animate-fade-in">
                Get a free SEO health check. SearchFuel analyzes your website and recommends high-impact content opportunities.
              </p>

              {/* URL Input Form */}
              <form onSubmit={handleScan} className="max-w-2xl mx-auto mb-12 animate-fade-in">
                <div className="flex flex-col sm:flex-row gap-4 p-2 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl">
                  <Input
                    type="text"
                    placeholder="Enter your website URL (e.g., example.com)"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 bg-white text-foreground border-0 h-14 text-lg px-6 rounded-xl focus-visible:ring-2 focus-visible:ring-accent"
                    required
                    disabled={isScanning}
                  />
                  <Button
                    type="submit"
                    variant="hero"
                    size="lg"
                    className="shrink-0"
                    disabled={isScanning}
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5" />
                        Scan Your Site
                      </>
                    )}
                  </Button>
                </div>
              </form>

              {/* Features */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto animate-fade-in">
                <div className="flex items-center justify-center gap-3 text-white/90">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-accent" />
                  </div>
                  <span className="font-medium">Instant Analysis</span>
                </div>
                <div className="flex items-center justify-center gap-3 text-white/90">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-accent" />
                  </div>
                  <span className="font-medium">AI Recommendations</span>
                </div>
                <div className="flex items-center justify-center gap-3 text-white/90">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-accent" />
                  </div>
                  <span className="font-medium">Free Health Check</span>
                </div>
              </div>
            </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        </div>
      )}

      {/* SEO Health Check Results */}
      {seoResults && (
        <div className="min-h-screen bg-background py-20 pt-32">
          <div className="container mx-auto px-6">
            {/* Header */}
            <div className="max-w-4xl mx-auto mb-12 text-center">
              <Badge className="mb-4 bg-green-500/10 text-green-600 border-green-500/20">
                SEO Health Check Complete
              </Badge>
              <h2 className="text-4xl font-bold text-foreground mb-4">
                Analysis for{" "}
                <span className="text-accent">{new URL(seoResults.url).hostname}</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-6">
                We've identified {seoResults.blogIdeas.length} high-potential keywords and content opportunities to boost your rankings.
              </p>
              
              {/* Get More Traffic CTA */}
              <Card className="p-6 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Ready to Get More Traffic?
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Sign in to automatically generate SEO-optimized articles and start ranking higher in search results.
                </p>
                <Button 
                  onClick={() => navigate("/?mode=signin")} 
                  size="lg" 
                  className="bg-accent hover:bg-accent/90"
                >
                  <Zap className="w-5 h-5 mr-2" />
                  Get More Traffic
                </Button>
              </Card>
            </div>

            {/* Blog Ideas Grid */}
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
              {seoResults.blogIdeas.map((idea) => {
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

                    <div className="space-y-3">
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
                  </Card>
                );
              })}
            </div>

          </div>
        </div>
      )}

      {/* Additional sections - only show if no results */}
      {!seoResults && (
        <>
          <Features />
          <HowItWorks />
          <SocialProof />
          <FinalCTA />
        </>
      )}

      <Footer />
    </div>
  );
};

export default Index;
