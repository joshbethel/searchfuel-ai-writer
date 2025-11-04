import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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

    const { blogId, type, postId } = await req.json();
    console.log(`Fetching WordPress data - Type: ${type}, Blog: ${blogId}`);

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
    const authHeader = credentials.apiKey 
      ? { 'Authorization': `Bearer ${credentials.apiKey}` }
      : {};

    let endpoint = '';
    let data = null;

    // Route to appropriate endpoint based on type
    switch (type) {
      case 'posts':
        endpoint = postId ? `${baseUrl}/posts/${postId}` : `${baseUrl}/posts?per_page=100`;
        break;
      
      case 'pages':
        endpoint = postId ? `${baseUrl}/pages/${postId}` : `${baseUrl}/pages?per_page=100`;
        break;
      
      case 'categories':
        endpoint = `${baseUrl}/categories?per_page=100`;
        break;
      
      case 'tags':
        endpoint = `${baseUrl}/tags?per_page=100`;
        break;
      
      case 'media':
        endpoint = postId ? `${baseUrl}/media/${postId}` : `${baseUrl}/media?per_page=100`;
        break;
      
      case 'site':
        endpoint = `${blog.cms_site_url}/wp-json`;
        break;
      
      default:
        return new Response(
          JSON.stringify({ error: "Invalid type parameter" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log(`Fetching from: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`WordPress API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch from WordPress: ${response.status}`,
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    data = await response.json();
    console.log(`Successfully fetched ${type} from WordPress`);

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Error fetching WordPress data:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
