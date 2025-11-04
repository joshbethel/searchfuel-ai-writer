/// <reference path="../deps.d.ts" />


import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

console.log("Scheduled Publisher Function Started");

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all scheduled posts that should be published now
    const now = new Date().toISOString();
    const { data: scheduledPosts, error: fetchError } = await supabase
      .from("blog_posts")
      .select("*, blogs(cms_platform, cms_site_url, cms_credentials)") // Include blog data for publishing
      .eq("publishing_status", "scheduled")
      .lte("scheduled_publish_date", now);

    if (fetchError) throw fetchError;

    console.log(`Found ${scheduledPosts?.length || 0} posts to publish`);

    const results = [];

    // Process each scheduled post
    for (const post of scheduledPosts || []) {
      try {
        console.log(`Publishing scheduled post: ${post.id} - ${post.title}`);

        // Call the publish-to-cms function
        const { data: publishResult, error: publishError } = await supabase.functions.invoke(
          "publish-to-cms",
          { body: { blog_post_id: post.id } }
        );

        if (publishError) throw publishError;

        // Update post status to published
        await supabase
          .from("blog_posts")
          .update({
            publishing_status: "published",
            published_at: new Date().toISOString(),
            scheduled_publish_date: null // Clear scheduled date after publishing
          })
          .eq("id", post.id);

        results.push({
          postId: post.id,
          title: post.title,
          status: "success",
          platform: post.blogs?.cms_platform
        });

        console.log(`Successfully published post ${post.id}`);
      } catch (error) {
        console.error(`Error publishing post ${post.id}:`, error);
        results.push({
          postId: post.id,
          title: post.title,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });

        // Update post status to failed
        await supabase
          .from("blog_posts")
          .update({
            publishing_status: "failed",
          })
          .eq("id", post.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: scheduledPosts?.length || 0,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in scheduled-publisher function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});