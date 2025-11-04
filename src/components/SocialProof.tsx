import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Star } from "lucide-react";

export const SocialProof = () => {
  const testimonials = [
    {
      name: "Sarah Johnson",
      role: "Marketing Director",
      company: "TechStart Inc",
      content: "SearchFuel transformed our content strategy. We've seen a 300% increase in organic traffic in just 3 months.",
      rating: 5,
    },
    {
      name: "Michael Chen",
      role: "Founder",
      company: "GrowthLabs",
      content: "The AI-generated content is surprisingly good. It saves us hours of work while maintaining quality.",
      rating: 5,
    },
    {
      name: "Emily Rodriguez",
      role: "SEO Manager",
      company: "Digital Solutions",
      content: "Finally, an SEO tool that actually delivers results. The keyword recommendations are spot-on.",
      rating: 5,
    },
  ];

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Trusted by growing companies
          </h2>
          <p className="text-lg text-muted-foreground">
            Join hundreds of businesses that have improved their search rankings with SearchFuel
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <Card
              key={index}
              className="p-6 bg-card/50 backdrop-blur-sm border-2 hover:border-accent/30 transition-all duration-300"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-accent text-accent" />
                ))}
              </div>
              <p className="text-foreground mb-6 leading-relaxed">
                "{testimonial.content}"
              </p>
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12 bg-accent/20">
                  <AvatarFallback className="bg-accent/20 text-accent font-semibold">
                    {testimonial.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {testimonial.role}, {testimonial.company}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
