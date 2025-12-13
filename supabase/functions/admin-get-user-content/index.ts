import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// CORS handling
const allowedOrigins = [
  "https://searchfuel-ai-writer.lovable.app",
  "https://preview--searchfuel-ai-writer.lovable.app",
  "https://ef7316e9-181c-4379-9b43-1c52f85bdf75.lovableproject.com",
  "https://app.trysearchfuel.com",
  "https://lovable.dev",
  "http://localhost:5173",
  "http://localhost:3000",
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  const normalizedOrigin = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(normalizedOrigin)) return true;
  if (normalizedOrigin.endsWith('.lovableproject.com')) return true;
  if (normalizedOrigin.endsWith('.lovable.app')) return true;
  return false;
}

function getCorsHeadersWithOrigin(origin: string | null) {
  const isAllowed = isOriginAllowed(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
}

interface GetUserContentRequest {
  target_user_id: string;
  content_type?: 'blogs' | 'blog_posts' | 'articles' | 'keywords' | 'all';
  summary_only?: boolean; // If true, only return counts without fetching all data
  minimal_fields?: boolean; // If true, only return minimal fields needed for table views (default: true)
  filters?: {
    blog_id?: string; // For blog_posts
    status?: string; // For blog_posts, articles
    content_id?: string; // For fetching a specific blog_post, article, etc. by ID
    limit?: number;
    offset?: number;
  };
}

interface ViewContentAuditDetails {
  content_type: string;
  content_ids?: string[];
  filters?: object;
  items_viewed: number;
}

// Helper function to check if user is admin
async function isAdminUser(supabaseService: any, userId: string): Promise<boolean> {
  const { data, error } = await supabaseService
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    return false;
  }
  return true;
}

// Helper function to log admin action
async function logAdminAction(
  supabaseService: any,
  adminUserId: string,
  actionType: string,
  targetUserId: string,
  details: ViewContentAuditDetails
) {
  try {
    await supabaseService
      .from('admin_actions')
      .insert({
        admin_user_id: adminUserId,
        action_type: actionType,
        target_user_id: targetUserId,
        details: details,
      });
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Don't throw - audit logging failure shouldn't break the operation
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeadersWithOrigin(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Initialize Supabase clients
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Authenticate admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminUserId = authData.user.id;

    // Check if user is admin
    const isAdmin = await isAdminUser(supabaseService, adminUserId);
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: GetUserContentRequest = await req.json();
    const { target_user_id, content_type = 'all', summary_only = false, minimal_fields = true, filters = {} } = body;

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: target_user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify target user exists
    const { data: targetUser, error: targetUserError } = await supabaseService.auth.admin.getUserById(target_user_id);
    if (targetUserError || !targetUser?.user) {
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const limit = filters.limit || 100;
    const offset = filters.offset || 0;
    const result: any = {
      blogs: null,
      blog_posts: null,
      articles: null,
      keywords: null,
    };
    const summary: any = {
      blogs_count: 0,
      blog_posts_count: 0,
      articles_count: 0,
      keywords_count: 0,
    };
    const contentIds: string[] = [];

    // Fetch blogs
    if (content_type === 'all' || content_type === 'blogs') {
      if (summary_only) {
        // Use count query for efficiency
        const { count, error: blogsError } = await supabaseService
          .from('blogs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', target_user_id);
        
        if (blogsError) {
          console.error('Error counting blogs:', blogsError);
        } else {
          summary.blogs_count = count || 0;
        }
      } else {
        let blogsQuery = supabaseService
          .from('blogs')
          .select('*')
          .eq('user_id', target_user_id)
          .order('created_at', { ascending: false });

        const { data: blogs, error: blogsError } = await blogsQuery;
        
        if (blogsError) {
          console.error('Error fetching blogs:', blogsError);
        } else {
          result.blogs = blogs || [];
          summary.blogs_count = blogs?.length || 0;
          if (blogs) {
            contentIds.push(...blogs.map((b: any) => b.id));
          }
        }
      }
    }

    // Fetch blog_posts
    if (content_type === 'all' || content_type === 'blog_posts') {
      // First get all blog IDs for this user
      const { data: userBlogs, error: blogsError } = await supabaseService
        .from('blogs')
        .select('id')
        .eq('user_id', target_user_id);

      if (blogsError) {
        console.error('Error fetching user blogs:', blogsError);
      } else {
        const blogIds = (userBlogs || []).map((b: any) => b.id);

        if (blogIds.length > 0) {
          if (summary_only) {
            // Use count query for efficiency
            let countQuery = supabaseService
              .from('blog_posts')
              .select('*', { count: 'exact', head: true })
              .in('blog_id', blogIds);

            // Apply filters
            if (filters.blog_id) {
              countQuery = countQuery.eq('blog_id', filters.blog_id);
            }
            if (filters.status) {
              countQuery = countQuery.eq('status', filters.status);
            }

            const { count, error: postsError } = await countQuery;
            
            if (postsError) {
              console.error('Error counting blog posts:', postsError);
            } else {
              summary.blog_posts_count = count || 0;
            }
          } else {
            // If content_id is provided, fetch only that specific post
            if (filters.content_id) {
              let singlePostQuery;
              if (minimal_fields) {
                singlePostQuery = supabaseService
                  .from('blog_posts')
                  .select(`
                    id,
                    title,
                    slug,
                    status,
                    published_at,
                    created_at,
                    blog_id,
                    blogs (
                      id,
                      title,
                      subdomain
                    )
                  `)
                  .eq('id', filters.content_id)
                  .in('blog_id', blogIds)
                  .single();
              } else {
                singlePostQuery = supabaseService
                  .from('blog_posts')
                  .select(`
                    *,
                    blogs (
                      id,
                      title,
                      subdomain,
                      user_id
                    )
                  `)
                  .eq('id', filters.content_id)
                  .in('blog_id', blogIds)
                  .single();
              }

              const { data: blogPost, error: postsError } = await singlePostQuery;
              
              if (postsError) {
                console.error('Error fetching blog post:', postsError);
                result.blog_posts = [];
              } else {
                result.blog_posts = blogPost ? [blogPost] : [];
                summary.blog_posts_count = blogPost ? 1 : 0;
                if (blogPost) {
                  contentIds.push(blogPost.id);
                }
              }
            } else {
              // Select minimal fields for table view, or all fields if minimal_fields is false
              let postsQuery;
              if (minimal_fields) {
                postsQuery = supabaseService
                  .from('blog_posts')
                  .select(`
                    id,
                    title,
                    slug,
                    status,
                    published_at,
                    created_at,
                    blog_id,
                    blogs (
                      id,
                      title,
                      subdomain
                    )
                  `)
                  .in('blog_id', blogIds);
              } else {
                postsQuery = supabaseService
                  .from('blog_posts')
                  .select(`
                    *,
                    blogs (
                      id,
                      title,
                      subdomain,
                      user_id
                    )
                  `)
                  .in('blog_id', blogIds);
              }

              // Apply filters
              if (filters.blog_id) {
                postsQuery = postsQuery.eq('blog_id', filters.blog_id);
              }
              if (filters.status) {
                postsQuery = postsQuery.eq('status', filters.status);
              }

              postsQuery = postsQuery
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

              const { data: blogPosts, error: postsError } = await postsQuery;
              
              if (postsError) {
                console.error('Error fetching blog posts:', postsError);
              } else {
                result.blog_posts = blogPosts || [];
                summary.blog_posts_count = blogPosts?.length || 0;
                if (blogPosts) {
                  contentIds.push(...blogPosts.map((p: any) => p.id));
                }
              }
            }
          }
        } else {
          if (!summary_only) {
            result.blog_posts = [];
          }
          summary.blog_posts_count = 0;
        }
      }
    }

    // Fetch articles
    if (content_type === 'all' || content_type === 'articles') {
      if (summary_only) {
        // Use count query for efficiency
        let countQuery = supabaseService
          .from('articles')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', target_user_id);

        if (filters.status) {
          countQuery = countQuery.eq('status', filters.status);
        }

        const { count, error: articlesError } = await countQuery;
        
        if (articlesError) {
          console.error('Error counting articles:', articlesError);
        } else {
          summary.articles_count = count || 0;
        }
      } else {
        // If content_id is provided, fetch only that specific article
        if (filters.content_id) {
          let singleArticleQuery;
          if (minimal_fields) {
            singleArticleQuery = supabaseService
              .from('articles')
              .select('id, title, keyword, intent, status, created_at')
              .eq('id', filters.content_id)
              .eq('user_id', target_user_id)
              .single();
          } else {
            singleArticleQuery = supabaseService
              .from('articles')
              .select('*')
              .eq('id', filters.content_id)
              .eq('user_id', target_user_id)
              .single();
          }

          const { data: article, error: articlesError } = await singleArticleQuery;
          
          if (articlesError) {
            console.error('Error fetching article:', articlesError);
            result.articles = [];
          } else {
            result.articles = article ? [article] : [];
            summary.articles_count = article ? 1 : 0;
            if (article) {
              contentIds.push(article.id);
            }
          }
        } else {
          // Select minimal fields for table view, or all fields if minimal_fields is false
          let articlesQuery;
          if (minimal_fields) {
            articlesQuery = supabaseService
              .from('articles')
              .select('id, title, keyword, intent, status, created_at')
              .eq('user_id', target_user_id);
          } else {
            articlesQuery = supabaseService
              .from('articles')
              .select('*')
              .eq('user_id', target_user_id);
          }

          if (filters.status) {
            articlesQuery = articlesQuery.eq('status', filters.status);
          }

          articlesQuery = articlesQuery
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

          const { data: articles, error: articlesError } = await articlesQuery;
          
          if (articlesError) {
            console.error('Error fetching articles:', articlesError);
          } else {
            result.articles = articles || [];
            summary.articles_count = articles?.length || 0;
            if (articles) {
              contentIds.push(...articles.map((a: any) => a.id));
            }
          }
        }
      }
    }

    // Fetch keywords
    if (content_type === 'all' || content_type === 'keywords') {
      if (summary_only) {
        // Use count query for efficiency
        const { count, error: keywordsError } = await supabaseService
          .from('keywords')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', target_user_id);
        
        if (keywordsError) {
          console.error('Error counting keywords:', keywordsError);
        } else {
          summary.keywords_count = count || 0;
        }
      } else {
        let keywordsQuery = supabaseService
          .from('keywords')
          .select('*')
          .eq('user_id', target_user_id)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        const { data: keywords, error: keywordsError } = await keywordsQuery;
        
        if (keywordsError) {
          console.error('Error fetching keywords:', keywordsError);
        } else {
          result.keywords = keywords || [];
          summary.keywords_count = keywords?.length || 0;
          if (keywords) {
            contentIds.push(...keywords.map((k: any) => k.id));
          }
        }
      }
    }

    // Log view action (only if not summary_only to avoid logging when just getting counts)
    if (!summary_only) {
      const totalItemsViewed = Object.values(summary).reduce((sum: number, count: any) => sum + count, 0);
      await logAdminAction(supabaseService, adminUserId, 'view_content', target_user_id, {
        content_type: content_type,
        content_ids: contentIds.length > 0 ? contentIds : undefined,
        filters: filters,
        items_viewed: totalItemsViewed,
      });
    }

    // Return response
    if (summary_only) {
      // When summary_only, only return summary counts
      return new Response(JSON.stringify({
        success: true,
        summary: summary,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else if (content_type === 'all') {
      return new Response(JSON.stringify({
        success: true,
        content: result,
        summary: summary,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      return new Response(JSON.stringify({
        success: true,
        content: {
          [content_type]: result[content_type],
        },
        summary: {
          [`${content_type}_count`]: summary[`${content_type}_count`],
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

  } catch (error) {
    console.error("Error in admin-get-user-content:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...getCorsHeadersWithOrigin(null), "Content-Type": "application/json" } }
    );
  }
});

