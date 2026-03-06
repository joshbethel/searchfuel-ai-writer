import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { 
  safeValidateRequest, 
  createValidationErrorResponse,
  analyzeCompetitorContentSchema
} from "../_shared/validation.ts";

const DATAFORSEO_LOGIN = Deno.env.get('DATAFORSEO_LOGIN');
const DATAFORSEO_PASSWORD = Deno.env.get('DATAFORSEO_PASSWORD');

interface CompetitorAnalysis {
  keyword: string;
  analyzed_at: string;
  location: string;
  language: string;
  user_defined_competitors_used: string[];
  serp_competitors: string[];
  top_urls: Array<{
    url: string;
    title: string;
    domain: string;
    word_count: number;
    headings: Array<{ level: number; text: string }>;
    keyword_density: number;
    meta_description?: string;
    first_100_words?: string;
  }>;
  insights: {
    avg_word_count: number;
    min_word_count: number;
    max_word_count: number;
    recommended_word_count: number;
    common_headings: string[];
    content_gaps: string[];
    volume?: number;
    difficulty?: number;
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");
  const requestId = crypto.randomUUID();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[analyze-competitor-content][${requestId}] Request started`);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY');
    }

    const authHeader = req.headers.get('Authorization');
    const internalCallHeader = req.headers.get('x-internal-edge-call');
    
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const isInternalServiceCall =
      internalCallHeader === "true" && token === SUPABASE_SERVICE_ROLE_KEY;
    console.log(
      `[analyze-competitor-content][${requestId}] Auth mode: ${isInternalServiceCall ? "internal-service" : "user-jwt"}`
    );

    let userId: string | null = null;
    if (!isInternalServiceCall) {
      const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
      if (authError || !authData.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = authData.user.id;
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate request body
    const requestBody = await req.json();
    const validationResult = safeValidateRequest(analyzeCompetitorContentSchema, requestBody);
    
    if (!validationResult.success) {
      return createValidationErrorResponse(validationResult, corsHeaders);
    }

    const { keyword, blogId, location_code, language_code } = validationResult.data;
    console.log(
      `[analyze-competitor-content][${requestId}] Validated request`,
      {
        blogId,
        keyword,
        location_code,
        language_code,
      }
    );

    // Verify blog access:
    // - Internal service call: blog must exist
    // - External/user call: blog must belong to authenticated user
    let blogQuery = supabase
      .from("blogs")
      .select("id, competitors")
      .eq("id", blogId);

    if (!isInternalServiceCall && userId) {
      blogQuery = blogQuery.eq("user_id", userId);
    }

    const { data: blog, error: blogError } = await blogQuery.single();

    if (blogError || !blog) {
      console.warn(
        `[analyze-competitor-content][${requestId}] Blog access denied or not found`,
        { blogId, userId, isInternalServiceCall, blogError }
      );
      return new Response(
        JSON.stringify({ error: "Blog not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cache (7 days)
    const { data: cachedPost } = await supabase
      .from("blog_posts")
      .select("competitor_analysis, competitor_analysis_at")
      .eq("blog_id", blogId)
      .not("competitor_analysis", "is", null)
      .order("competitor_analysis_at", { ascending: false })
      .limit(1)
      .single();

    if (cachedPost?.competitor_analysis) {
      const cached = cachedPost.competitor_analysis as CompetitorAnalysis;
      const analyzedAt = new Date(cachedPost.competitor_analysis_at);
      const daysSince = (Date.now() - analyzedAt.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSince < 7 && cached.keyword.toLowerCase() === keyword.toLowerCase()) {
        console.log(
          `[analyze-competitor-content][${requestId}] Cache hit`,
          { blogId, keyword, cachedDaysOld: Number(daysSince.toFixed(2)) }
        );
        return new Response(
          JSON.stringify({ analysis: cached }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    console.log(
      `[analyze-competitor-content][${requestId}] Cache miss, running fresh analysis`,
      { blogId, keyword }
    );

    // Get user-defined competitors
    const userCompetitors = (blog.competitors as any[]) || [];
    const userCompetitorDomains = userCompetitors.map(c => {
      if (typeof c === 'string') return c.toLowerCase();
      return (c.domain || c.name || c).toLowerCase();
    }).filter(Boolean);
    console.log(
      `[analyze-competitor-content][${requestId}] Loaded user competitors`,
      { count: userCompetitorDomains.length }
    );

    // Fetch SERP data from DataForSEO
    if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "DataForSEO API not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[analyze-competitor-content][${requestId}] Calling DataForSEO SERP API`,
      { keyword, location_code, language_code, depth: 5 }
    );
    const serpResponse = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        keyword,
        location_code,
        language_code,
        depth: 5
      }])
    });

    if (!serpResponse.ok) {
      const errorBody = await serpResponse.text();
      console.error(
        `[analyze-competitor-content][${requestId}] DataForSEO SERP API HTTP error`,
        { status: serpResponse.status, errorBody }
      );
      throw new Error(`DataForSEO SERP API error: ${serpResponse.status} - ${errorBody}`);
    }

    const serpData = await serpResponse.json();
    console.log(
      `[analyze-competitor-content][${requestId}] DataForSEO SERP API response received`,
      {
        status_code: serpData?.status_code,
        tasks_count: Array.isArray(serpData?.tasks) ? serpData.tasks.length : 0,
      }
    );
    
    if (serpData.status_code !== 20000) {
      console.error(
        `[analyze-competitor-content][${requestId}] DataForSEO SERP API logical error`,
        { status_code: serpData.status_code, status_message: serpData.status_message }
      );
      throw new Error(`DataForSEO API error: ${serpData.status_message}`);
    }

    // Extract top URLs from SERP
    const tasks = serpData.tasks || [];
    const topUrls: any[] = [];
    const serpCompetitorDomains = new Set<string>();

    for (const task of tasks) {
      if (!task.result || !task.result[0]?.items) continue;
      
      for (const item of task.result[0].items.slice(0, 5)) {
        if (item.type === 'organic' && item.url) {
          try {
            const domain = new URL(item.url).hostname.replace(/^www\./, '');
            serpCompetitorDomains.add(domain);
            
            topUrls.push({
              url: item.url,
              title: item.title || '',
              domain: domain,
              snippet: item.snippet || ''
            });
          } catch (e) {
            console.error("Error parsing URL:", item.url, e);
          }
        }
      }
    }
    console.log(
      `[analyze-competitor-content][${requestId}] Extracted SERP URLs`,
      {
        topUrlsCount: topUrls.length,
        serpCompetitorDomainsCount: serpCompetitorDomains.size,
      }
    );

    // Combine user-defined and SERP competitors
    const allCompetitorDomains = [
      ...userCompetitorDomains,
      ...Array.from(serpCompetitorDomains).filter(d => !userCompetitorDomains.includes(d))
    ];
    console.log(
      `[analyze-competitor-content][${requestId}] Combined competitors`,
      {
        totalCompetitors: allCompetitorDomains.length,
        userDefined: userCompetitorDomains.length,
        serpDetected: serpCompetitorDomains.size,
      }
    );

    // Analyze content from top URLs (simplified - in production, you'd scrape content)
    const analyzedUrls = topUrls.slice(0, 5).map((urlData) => {
      // In production, you'd fetch and parse the actual HTML content
      // For now, we'll estimate based on snippet length
      const estimatedWordCount = Math.floor((urlData.snippet?.length || 0) / 5) + 1500;
      
      return {
        url: urlData.url,
        title: urlData.title,
        domain: urlData.domain,
        word_count: estimatedWordCount,
        headings: [
          { level: 2, text: urlData.title.split(' ').slice(0, 5).join(' ') }
        ],
        keyword_density: 2.5,
        meta_description: urlData.snippet,
        first_100_words: urlData.snippet?.substring(0, 100) || ''
      };
    });

    // Calculate insights
    const wordCounts = analyzedUrls.map(u => u.word_count);
    const avgWordCount = wordCounts.length > 0 
      ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length)
      : 2000;
    const minWordCount = wordCounts.length > 0 ? Math.min(...wordCounts) : 1500;
    const maxWordCount = wordCounts.length > 0 ? Math.max(...wordCounts) : 2500;
    const recommendedWordCount = Math.max(avgWordCount, maxWordCount * 0.9);

    // Fetch Volume and Difficulty from DataForSEO Keyword API
    let volume = 0;
    let difficulty = 0;

    try {
      console.log(
        `[analyze-competitor-content][${requestId}] Calling DataForSEO keyword metrics API`,
        { keyword }
      );
      const keywordResponse = await fetch('https://api.dataforseo.com/v3/keywords_data/google/search_volume/live', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
          location_name: "United States",
          keywords: [keyword]
        }])
      });

      if (keywordResponse.ok) {
        const keywordData = await keywordResponse.json();
        console.log(
          `[analyze-competitor-content][${requestId}] Keyword metrics API response`,
          { status_code: keywordData?.status_code }
        );
        if (keywordData.status_code === 20000 && keywordData.tasks?.[0]?.result?.[0]) {
          volume = keywordData.tasks[0].result[0].search_volume || 0;
          difficulty = keywordData.tasks[0].result[0].keyword_difficulty || 0;
        }
      } else {
        const keywordErrorBody = await keywordResponse.text();
        console.warn(
          `[analyze-competitor-content][${requestId}] Keyword metrics API HTTP error`,
          { status: keywordResponse.status, errorBody: keywordErrorBody }
        );
      }
    } catch (error) {
      console.error(
        `[analyze-competitor-content][${requestId}] Error fetching keyword metrics`,
        error
      );
      // Continue without volume/difficulty
    }

    const analysis: CompetitorAnalysis = {
      keyword,
      analyzed_at: new Date().toISOString(),
      location: "United States",
      language: language_code,
      user_defined_competitors_used: userCompetitorDomains,
      serp_competitors: Array.from(serpCompetitorDomains),
      top_urls: analyzedUrls,
      insights: {
        avg_word_count: avgWordCount,
        min_word_count: minWordCount,
        max_word_count: maxWordCount,
        recommended_word_count: recommendedWordCount,
        common_headings: analyzedUrls.flatMap(u => u.headings.map(h => h.text)),
        content_gaps: [],
        volume,
        difficulty
      }
    };
    console.log(
      `[analyze-competitor-content][${requestId}] Analysis completed successfully`,
      {
        keyword,
        topUrlsCount: analysis.top_urls.length,
        avgWordCount: analysis.insights.avg_word_count,
        recommendedWordCount: analysis.insights.recommended_word_count,
        volume: analysis.insights.volume,
        difficulty: analysis.insights.difficulty,
      }
    );

    return new Response(
      JSON.stringify({ analysis }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[analyze-competitor-content][${requestId}] Error`, error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

