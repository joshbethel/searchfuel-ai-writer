import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { blogId, type, postId, updateData } = await req.json();

    if (!postId || !updateData) {
      return new Response(
        JSON.stringify({ error: "postId and updateData are required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Updating WordPress ${type} - ID: ${postId}`);

    // Get blog configuration
    const { data: blog, error: blogError } = await supabase
      .from('blogs')
      .select('*')
      .eq('id', blogId)
      .eq('user_id', user.id)
      .single();

    if (blogError || !blog) {
      return new Response(
        JSON.stringify({ error: "Blog not found" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (blog.cms_platform !== 'wordpress') {
      return new Response(
        JSON.stringify({ error: "Blog is not connected to WordPress" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = `${blog.cms_site_url}/wp-json/wp/v2`;
    const credentials = blog.cms_credentials || {};
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (credentials.apiKey) {
      headers['Authorization'] = `Bearer ${credentials.apiKey}`;
    }

    let endpoint = '';

    // Route to appropriate endpoint based on type
    switch (type) {
      case 'post':
        endpoint = `${baseUrl}/posts/${postId}`;
        break;
      
      case 'page':
        endpoint = `${baseUrl}/pages/${postId}`;
        break;
      
      case 'media':
        endpoint = `${baseUrl}/media/${postId}`;
        break;
      
      default:
        return new Response(
          JSON.stringify({ error: "Invalid type parameter. Use 'post', 'page', or 'media'" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log(`Updating at: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`WordPress API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ 
          error: `Failed to update WordPress content: ${response.status}`,
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log(`Successfully updated ${type} in WordPress`);

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Error updating WordPress content:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
