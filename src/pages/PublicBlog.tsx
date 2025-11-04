import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock } from "lucide-react";

interface Blog {
  id: string;
  title: string;
  description: string | null;
  logo_url: string | null;
  website_homepage: string | null;
}

interface BlogPost {
  id: string;
  title: string;
  excerpt: string | null;
  slug: string;
  published_at: string;
  featured_image: string | null;
}

export default function PublicBlog() {
  const { subdomain } = useParams();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBlogData();
  }, [subdomain]);

  const fetchBlogData = async () => {
    if (!subdomain) return;

    try {
      // Fetch blog details
      const { data: blogData, error: blogError } = await supabase
        .from("blogs")
        .select("id, title, description, logo_url, website_homepage")
        .eq("subdomain", subdomain)
        .eq("is_published", true)
        .maybeSingle();

      if (blogError) throw blogError;
      if (!blogData) {
        setLoading(false);
        return;
      }

      setBlog(blogData);

      // Fetch published posts
      const { data: postsData, error: postsError } = await supabase
        .from("blog_posts")
        .select("id, title, excerpt, slug, published_at, featured_image")
        .eq("blog_id", blogData.id)
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (postsError) throw postsError;
      setPosts(postsData || []);
    } catch (error) {
      console.error("Error fetching blog:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">Blog Not Found</h1>
          <p className="text-muted-foreground">
            This blog does not exist or has not been published yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            {blog.logo_url && blog.website_homepage ? (
              <a 
                href={blog.website_homepage} 
                target="_blank" 
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-80"
              >
                <img 
                  src={blog.logo_url} 
                  alt={blog.title}
                  className="h-12 w-auto object-contain"
                />
              </a>
            ) : blog.logo_url ? (
              <img 
                src={blog.logo_url} 
                alt={blog.title}
                className="h-12 w-auto object-contain"
              />
            ) : (
              <h1 className="text-2xl font-bold text-foreground">{blog.title}</h1>
            )}
            {blog.logo_url && (
              <div className="ml-auto">
                {blog.website_homepage && (
                  <a
                    href={blog.website_homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Visit Website →
                  </a>
                )}
              </div>
            )}
          </div>
          {blog.description && (
            <p className="text-muted-foreground mt-2">{blog.description}</p>
          )}
        </div>
      </header>

      {/* Blog Posts */}
      <main className="container mx-auto px-4 py-12">
        {posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No posts published yet.</p>
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.id} to={`/${subdomain}/${post.slug}`}>
                <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer h-full">
                  {post.featured_image && (
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={post.featured_image}
                        alt={post.title}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="p-6">
                    <h2 className="text-xl font-bold text-foreground mb-2 line-clamp-2">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="text-muted-foreground mb-4 line-clamp-3">
                        {post.excerpt}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {post.published_at && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(post.published_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
