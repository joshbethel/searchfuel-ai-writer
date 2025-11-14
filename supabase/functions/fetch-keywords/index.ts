import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DATAFORSEO_LOGIN = Deno.env.get("DATAFORSEO_LOGIN");
    const DATAFORSEO_PASSWORD = Deno.env.get("DATAFORSEO_PASSWORD");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get request body
    const { keywords, location_code = 2840, language_code = "en" } = await req.json();

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return new Response(
        JSON.stringify({ error: "Keywords array is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Fetching data for ${keywords.length} keywords from DataForSEO`);

    // Prepare DataForSEO API request
    const dataforSEOPayload = [
      {
        location_code,
        language_code,
        keywords,
      },
    ];

    // Call DataForSEO API
    const authString = btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);
    const dataforSEOResponse = await fetch(
      "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authString}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataforSEOPayload),
      }
    );

    if (!dataforSEOResponse.ok) {
      const errorText = await dataforSEOResponse.text();
      console.error("DataForSEO API error:", dataforSEOResponse.status, errorText);
      throw new Error(`DataForSEO API error: ${dataforSEOResponse.status}`);
    }

    const dataforSEOData = await dataforSEOResponse.json();
    console.log("DataForSEO response:", JSON.stringify(dataforSEOData, null, 2));

    // Check for API errors
    if (dataforSEOData.status_code !== 20000) {
      throw new Error(`DataForSEO API error: ${dataforSEOData.status_message}`);
    }

    // Get user ID from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Process results and insert into database
    const processedKeywords = [];
    const tasks = dataforSEOData.tasks || [];

    for (const task of tasks) {
      if (!task.result) continue;

      for (const keywordData of task.result) {
        // Determine keyword intent based on keyword content
        let intent = "Informational";
        const kw = keywordData.keyword.toLowerCase();
        
        if (kw.includes("buy") || kw.includes("price") || kw.includes("cost") || kw.includes("cheap")) {
          intent = "Commercial";
        } else if (kw.includes("near me") || kw.includes("how to") || kw.includes("installation")) {
          intent = "Transactional";
        } else if (kw.includes("best") || kw.includes("review") || kw.includes("vs")) {
          intent = "Commercial";
        }

        // Calculate difficulty (0-100 scale based on competition)
        const difficulty = keywordData.competition 
          ? Math.round(keywordData.competition * 100) 
          : null;

        // Determine trend based on monthly searches if available
        let trend = "stable";
        if (keywordData.monthly_searches && keywordData.monthly_searches.length >= 2) {
          const recent = keywordData.monthly_searches.slice(-3);
          const older = keywordData.monthly_searches.slice(-6, -3);
          const recentAvg = recent.reduce((sum: number, m: any) => sum + (m.search_volume || 0), 0) / recent.length;
          const olderAvg = older.reduce((sum: number, m: any) => sum + (m.search_volume || 0), 0) / older.length;
          
          if (recentAvg > olderAvg * 1.1) trend = "up";
          else if (recentAvg < olderAvg * 0.9) trend = "down";
        }

        const keywordRecord = {
          user_id: user.id,
          keyword: keywordData.keyword,
          search_volume: keywordData.search_volume || 0,
          cpc: keywordData.cpc || 0,
          competition: keywordData.competition || null,
          difficulty,
          intent,
          trend,
          location_code,
          language_code,
        };

        processedKeywords.push(keywordRecord);
      }
    }

    console.log(`Processed ${processedKeywords.length} keywords, inserting into database`);

    // Check current keyword count and limit before insertion
    const { count: currentCount } = await supabase
      .from("keywords")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    // Get user's subscription to check limit
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id, plan_name, keywords_count')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    const maxKeywords = subscription?.plan_name === 'pro' ? 100 : 10;
    const currentKeywordCount = currentCount || 0;

    // Estimate new count (upsert might not add all if duplicates exist)
    // We'll check actual count after insertion
    const estimatedNewCount = Math.max(currentKeywordCount, processedKeywords.length);

    // Insert keywords into database
    const { data: insertedKeywords, error: insertError } = await supabase
      .from("keywords")
      .upsert(processedKeywords, {
        onConflict: "user_id,keyword,location_code",
        ignoreDuplicates: false,
      })
      .select();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw insertError;
    }

    // Check actual count after insertion
    const { count: finalCount } = await supabase
      .from("keywords")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (finalCount && finalCount > maxKeywords) {
      // This shouldn't happen if limits are enforced, but log a warning
      console.warn(`User ${user.id} has ${finalCount} keywords, exceeding limit of ${maxKeywords}`);
    }

    // Update keyword count in subscriptions table
    if (subscription && finalCount !== null) {
      await supabase
        .from('subscriptions')
        .update({ keywords_count: finalCount })
        .eq('id', subscription.id);
    }

    console.log(`Successfully inserted ${insertedKeywords?.length || 0} keywords`);

    return new Response(
      JSON.stringify({
        success: true,
        keywords: insertedKeywords,
        count: insertedKeywords?.length || 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in fetch-keywords function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
