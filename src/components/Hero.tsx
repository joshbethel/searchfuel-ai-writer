import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, TrendingUp, Zap } from "lucide-react";
import { useState } from "react";
import heroBackground from "@/assets/hero-background.jpg";

interface HeroProps {
  onScanStart: (url: string) => void;
}

export const Hero = ({ onScanStart }: HeroProps) => {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      // Add https:// if no protocol is specified
      const formattedUrl = url.trim().match(/^https?:\/\//) 
        ? url.trim() 
        : `https://${url.trim()}`;
      onScanStart(formattedUrl);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#1a2332]">
      {/* Background with gradient overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-10"
        style={{ backgroundImage: `url(${heroBackground})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a2332] via-[#1e2838] to-[#151d29]" />
      
      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 py-24">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent/15 border border-accent/20 text-white mb-8 animate-fade-in backdrop-blur-sm">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-semibold tracking-wide">Latest feature just launched</span>
          </div>

          {/* Heading */}
          <h1 className="text-6xl md:text-8xl font-black text-white mb-8 animate-fade-in leading-[0.95] tracking-tight">
            Enhance your
            <br />
            <span className="bg-gradient-to-r from-accent via-accent/90 to-accent/80 bg-clip-text text-transparent">
              visibility by using AI.
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-xl md:text-2xl text-white/70 mb-12 max-w-3xl mx-auto animate-fade-in font-medium leading-relaxed">
            Effortlessly boost your website's presence with AI — blending intelligent technology and easy-to-use SEO solutions.
          </p>

          {/* URL Input Form */}
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-16 animate-fade-in">
            <div className="flex flex-col sm:flex-row gap-4 p-2 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl">
              <Input
                type="text"
                placeholder="yourwebsite.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-white text-foreground border-0 h-16 text-lg px-6 rounded-xl focus-visible:ring-2 focus-visible:ring-accent font-medium"
                required
              />
              <Button
                type="submit"
                className="shrink-0 h-16 px-8 text-base font-semibold rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg hover:shadow-xl transition-all"
                size="lg"
              >
                Get Started Free
              </Button>
            </div>
          </form>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto animate-fade-in">
            <div className="flex flex-col items-center gap-3 text-white/80 group">
              <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center group-hover:bg-accent/25 transition-colors">
                <TrendingUp className="w-6 h-6 text-accent" />
              </div>
              <span className="font-semibold text-base">Instant Analysis</span>
            </div>
            <div className="flex flex-col items-center gap-3 text-white/80 group">
              <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center group-hover:bg-accent/25 transition-colors">
                <Sparkles className="w-6 h-6 text-accent" />
              </div>
              <span className="font-semibold text-base">AI-Generated Content</span>
            </div>
            <div className="flex flex-col items-center gap-3 text-white/80 group">
              <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center group-hover:bg-accent/25 transition-colors">
                <Zap className="w-6 h-6 text-accent" />
              </div>
              <span className="font-semibold text-base">One-Click Publishing</span>
            </div>
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
    </div>
  );
};
