import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Blog {
  id: string;
  title: string;
  subdomain: string;
  logo_url: string | null;
  website_homepage: string | null;
}

interface BlogPost {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  published_at: string;
  featured_image: string | null;
}

// Remove the first H1 from content to avoid duplication
const removeFirstH1 = (content: string) => {
  return content.replace(/^#\s+.+$/m, '').trim();
};

export default function PublicBlogPost() {
  const { subdomain, slug } = useParams();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPostData();
  }, [subdomain, slug]);

  const fetchPostData = async () => {
    if (!subdomain || !slug) return;

    try {
      // Fetch blog details
      const { data: blogData, error: blogError } = await supabase
        .from("blogs")
        .select("id, title, subdomain, logo_url, website_homepage")
        .eq("subdomain", subdomain)
        .eq("is_published", true)
        .maybeSingle();

      if (blogError) throw blogError;
      if (!blogData) {
        setLoading(false);
        return;
      }

      setBlog(blogData);

      // Fetch post
      const { data: postData, error: postError } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("blog_id", blogData.id)
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

      if (postError) throw postError;
      setPost(postData);
    } catch (error) {
      console.error("Error fetching post:", error);
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

  if (!blog || !post) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">Post Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This blog post does not exist or has not been published yet.
          </p>
          {subdomain && (
            <Link to={`/${subdomain}`}>
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Blog
              </Button>
            </Link>
          )}
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
          </div>
        </div>
      </header>

      {/* Blog Post Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <Link to={`/${subdomain}`}>
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to all posts
            </Button>
          </Link>

          <article className="prose prose-lg dark:prose-invert max-w-none">
            {post.featured_image && (
              <img
                src={post.featured_image}
                alt={post.title}
                className="w-full aspect-video object-cover rounded-lg mb-8"
              />
            )}

            <h1 className="text-4xl font-bold text-foreground mb-4">
              {post.title}
            </h1>

            <div className="flex items-center gap-2 text-muted-foreground mb-8">
              <Calendar className="w-4 h-4" />
              <time dateTime={post.published_at}>
                {new Date(post.published_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </time>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none
              prose-headings:font-bold prose-headings:text-foreground
              prose-h1:text-5xl prose-h1:mb-6 prose-h1:mt-8 prose-h1:leading-tight
              prose-h2:text-3xl prose-h2:mb-4 prose-h2:mt-8 prose-h2:pb-3 prose-h2:border-b prose-h2:border-border
              prose-h3:text-2xl prose-h3:mb-3 prose-h3:mt-6
              prose-p:text-base prose-p:leading-relaxed prose-p:mb-4 prose-p:text-foreground/90
              prose-ul:my-6 prose-ol:my-6 prose-ul:text-foreground/90 prose-ol:text-foreground/90
              prose-li:mb-2 prose-li:text-foreground/90
              prose-strong:text-foreground prose-strong:font-bold
              prose-a:text-primary prose-a:font-medium hover:prose-a:text-primary/80
              prose-table:w-full prose-table:my-8 prose-table:border-collapse
              prose-thead:bg-muted
              prose-th:border prose-th:border-border prose-th:p-4 prose-th:text-left prose-th:font-bold prose-th:text-foreground
              prose-td:border prose-td:border-border prose-td:p-4 prose-td:text-foreground/90
              prose-tr:border-b prose-tr:border-border
              prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {removeFirstH1(post.content)}
              </ReactMarkdown>
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}
