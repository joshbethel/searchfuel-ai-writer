import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ArrowLeft, Calendar } from "lucide-react";

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  slug: string;
  published_at: string;
  featured_image: string | null;
  article_type: string | null;
  publishing_status: string | null;
  external_post_id: string | null;
  blog_id: string;
}

const ARTICLE_TYPE_LABELS: Record<string, { name: string; emoji: string }> = {
  listicle: { name: "Listicle", emoji: "🔢" },
  how_to: { name: "How-to", emoji: "📖" },
  checklist: { name: "Checklist", emoji: "✅" },
  qa: { name: "Q&A", emoji: "❓" },
  versus: { name: "Versus", emoji: "⚔️" },
  roundup: { name: "Roundup", emoji: "🎯" },
  news: { name: "News", emoji: "📰" },
  interactive_tool: { name: "Tool", emoji: "🛠️" },
  advertorial: { name: "Advertorial", emoji: "💼" },
};

export default function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      // Fetch all published posts from all blogs
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, excerpt, slug, published_at, featured_image, article_type, publishing_status, external_post_id, blog_id")
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading posts...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">SearchFuel Blog</h1>
              <p className="text-muted-foreground mt-1">
                Expert insights on SEO content automation and digital marketing
              </p>
            </div>
            <Button variant="ghost" asChild>
              <Link to="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Posts Grid */}
      <main className="container mx-auto px-4 py-12">
        {posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No posts published yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post) => (
              <Link
                key={post.id}
                to={`/blog/${post.slug}`}
                className="group block"
              >
                <article className="h-full border rounded-lg overflow-hidden hover:shadow-lg transition-all bg-card">
                  {/* Featured Image */}
                  {post.featured_image && (
                    <div className="aspect-video bg-muted overflow-hidden">
                      <img
                        src={post.featured_image}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-6 space-y-3">
                    {/* Article Type Badge */}
                    {post.article_type && ARTICLE_TYPE_LABELS[post.article_type] && (
                      <Badge variant="secondary" className="text-xs">
                        {ARTICLE_TYPE_LABELS[post.article_type].emoji}{" "}
                        {ARTICLE_TYPE_LABELS[post.article_type].name}
                      </Badge>
                    )}

                    {/* Title */}
                    <h2 className="text-xl font-semibold group-hover:text-primary transition-colors line-clamp-2">
                      {post.title}
                    </h2>

                    {/* Excerpt */}
                    {post.excerpt && (
                      <p className="text-muted-foreground text-sm line-clamp-3">
                        {post.excerpt}
                      </p>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                      <Calendar className="w-3 h-3" />
                      <time>
                        {format(new Date(post.published_at), "MMM d, yyyy")}
                      </time>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}

        {/* CTA Section */}
        <div className="mt-16 text-center py-12 px-6 border rounded-lg bg-card">
          <h2 className="text-2xl font-bold mb-4">
            Want automated content like this?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            SearchFuel automatically generates SEO-optimized blog posts tailored to your business.
            Save time and boost your search rankings with AI-powered content.
          </p>
          <Button size="lg" asChild>
            <Link to="/">Get Started Free</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
