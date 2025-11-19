// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check for Basic Authentication
    const authHeader = req.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return new Response(
        JSON.stringify({ error: "Basic authentication required" }),
        { 
          status: 401, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "WWW-Authenticate": 'Basic realm="Post Data API"'
          } 
        }
      );
    }

    // Decode Basic Auth credentials
    const base64Credentials = authHeader.split(" ")[1];
    const credentials = atob(base64Credentials);
    const [email, password] = credentials.split(":");

    console.log(`Authentication attempt for user: ${email}`);

    // Initialize Supabase client for auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify credentials
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      console.error("Authentication failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log(`User authenticated: ${authData.user.id}`);

    // Get post_id from query parameters
    const url = new URL(req.url);
    const post_id = url.searchParams.get("post_id");

    if (!post_id) {
      return new Response(
        JSON.stringify({ error: "post_id parameter is required" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log(`Fetching post data for ID: ${post_id}`);

    // Use service role for data fetching
    const supabaseServiceUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseService = createClient(supabaseServiceUrl, supabaseServiceKey);

    // Fetch the blog post
    const { data: post, error } = await supabaseService
      .from("blog_posts")
      .select(`
        id,
        title,
        slug,
        content,
        excerpt,
        featured_image,
        meta_title,
        meta_description,
        article_type,
        status,
        publishing_status,
        external_post_id,
        published_at,
        created_at,
        updated_at,
        blog_id,
        blogs(
          cms_platform,
          cms_site_url,
          title,
          company_name
        )
      `)
      .eq("id", post_id)
      .single();

    if (error) {
      console.error("Error fetching post:", error);
      return new Response(
        JSON.stringify({ error: "Post not found", details: error.message }),
        { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log(`Successfully fetched post: ${post.title}`);

    // Format response for Framer CMS compatibility
    const response = {
      success: true,
      post_id: post.id,
      platform: post.blogs?.cms_platform || "framer",
      site_url: post.blogs?.cms_site_url || "",
      data: {
        // Core fields
        id: post.id,
        title: post.title,
        slug: post.slug,
        content: post.content,
        excerpt: post.excerpt || "",
        
        // SEO fields
        meta_title: post.meta_title || post.title,
        meta_description: post.meta_description || post.excerpt || "",
        
        // Media
        featured_image: post.featured_image || "",
        
        // Metadata
        article_type: post.article_type || "",
        status: post.status,
        publishing_status: post.publishing_status,
        external_post_id: post.external_post_id || "",
        
        // Timestamps
        published_at: post.published_at || new Date().toISOString(),
        created_at: post.created_at,
        updated_at: post.updated_at,
        
        // Blog info
        blog_title: post.blogs?.title || "",
        company_name: post.blogs?.company_name || ""
      },
      
      // Instructions for manual sync
      instructions: {
        message: "Use this data to manually add/sync the post in Framer CMS",
        steps: [
          "1. Copy the post data below",
          "2. Go to your Framer CMS collection",
          "3. Create or update a post with this data",
          "4. After syncing in Framer, click 'Publish' button in the app to update the status"
        ]
      }
    };

    return new Response(
      JSON.stringify(response, null, 2),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in get-post-data function:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error", 
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
