import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduledKeyword {
  id: string;
  keyword: string;
  blog_id: string;
  scheduled_date: string;
  user_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting scheduled article generation check...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    console.log("Checking for scheduled posts for date:", todayStr);

    // Find all scheduled keywords for today
    const { data: scheduledKeywords, error: schedError } = await supabase
      .from('scheduled_keywords')
      .select('*, blogs!inner(user_id)')
      .lte('scheduled_date', todayStr)
      .eq('status', 'pending');

    if (schedError) {
      console.error("Error fetching scheduled keywords:", schedError);
      throw schedError;
    }

    console.log(`Found ${scheduledKeywords?.length || 0} scheduled keywords`);

    if (!scheduledKeywords || scheduledKeywords.length === 0) {
      return new Response(
        JSON.stringify({ message: "No scheduled posts found for today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    // Process each scheduled keyword
    for (const scheduled of scheduledKeywords) {
      try {
        console.log(`Generating article for keyword: ${scheduled.keyword}`);

        // Call generate-blog-post function
        const { data: generateData, error: generateError } = await supabase.functions.invoke(
          'generate-blog-post',
          {
            body: {
              keyword: scheduled.keyword,
              blogId: scheduled.blog_id,
            }
          }
        );

        if (generateError) {
          console.error(`Error generating article for ${scheduled.keyword}:`, generateError);
          
          // Mark as failed
          await supabase
            .from('scheduled_keywords')
            .update({ 
              status: 'failed',
              error_message: generateError.message 
            })
            .eq('id', scheduled.id);

          results.push({
            keyword: scheduled.keyword,
            success: false,
            error: generateError.message
          });
          continue;
        }

        // Mark as completed
        await supabase
          .from('scheduled_keywords')
          .update({ 
            status: 'completed',
            post_id: generateData?.postId 
          })
          .eq('id', scheduled.id);

        results.push({
          keyword: scheduled.keyword,
          success: true,
          postId: generateData?.postId
        });

        console.log(`Successfully generated article for: ${scheduled.keyword}`);
      } catch (error) {
        console.error(`Error processing ${scheduled.keyword}:`, error);
        results.push({
          keyword: scheduled.keyword,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: "Scheduled article generation completed",
        processed: results.length,
        results
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in scheduled article generation:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
