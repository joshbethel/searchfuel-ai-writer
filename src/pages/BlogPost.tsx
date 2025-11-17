import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface BlogPost {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  published_at: string;
  featured_image: string | null;
  article_type: string | null;
  meta_title: string | null;
  meta_description: string | null;
}

// Remove the first H1 from content to avoid duplication
const removeFirstH1 = (content: string) => {
  return content.replace(/^#\s+.+$/m, '').trim();
};

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPost = async () => {
      if (!slug) return;

      try {
        const { data, error } = await supabase
          .from("blog_posts")
          .select("*")
          .eq("slug", slug)
          .in("publishing_status", ["published", "scheduled"])
          .maybeSingle();

        if (error) {
          console.error("Error fetching post:", error);
          return;
        }

        setPost(data);
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold text-foreground">Post Not Found</h1>
        <Link to="/blog">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Blog
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-6">
            <Link 
              to="/articles" 
              className="inline-flex items-center gap-2 text-foreground hover:text-primary transition-colors font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Articles</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <Link 
              to="/blog" 
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              SearchFuel Blog
            </Link>
          </div>
        </div>
      </header>

      {/* Blog Post Content */}
      <main className="container mx-auto px-4 py-12">
        <article className="max-w-4xl mx-auto">
          {post.featured_image && (
            <img
              src={post.featured_image}
              alt={post.title}
              className="w-full h-[400px] object-cover rounded-lg mb-8"
            />
          )}

          <h1 className="text-4xl font-bold text-foreground mb-4">
            {post.title}
          </h1>

          <p className="text-muted-foreground mb-8">
            Published on {format(new Date(post.published_at), "MMMM d, yyyy")}
          </p>

          {/* SEO Metadata */}
          {(post.meta_title || post.meta_description) && (
            <div className="bg-secondary/50 border border-border rounded-lg p-6 mb-8">
              <h2 className="text-lg font-bold text-foreground mb-4">SEO Metadata</h2>
              <div className="space-y-3">
                {post.meta_title && (
                  <div>
                    <span className="text-sm font-semibold text-muted-foreground">Meta Title:</span>
                    <p className="text-foreground">{post.meta_title}</p>
                  </div>
                )}
                {post.meta_description && (
                  <div>
                    <span className="text-sm font-semibold text-muted-foreground">Meta Description:</span>
                    <p className="text-foreground">{post.meta_description}</p>
                  </div>
                )}
              </div>
            </div>
          )}

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

          <div className="mt-12 pt-8 border-t border-border">
            <Link to="/blog">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to all posts
              </Button>
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
};

export default BlogPost;
