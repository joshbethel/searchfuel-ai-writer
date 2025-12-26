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

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const authHeader = req.headers.get('Authorization');
    
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

    const userId = authData.user.id;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate request body
    const requestBody = await req.json();
    const validationResult = safeValidateRequest(analyzeCompetitorContentSchema, requestBody);
    
    if (!validationResult.success) {
      return createValidationErrorResponse(validationResult, corsHeaders);
    }

    const { keyword, blogId, location_code, language_code } = validationResult.data;

    // Verify blog ownership
    const { data: blog, error: blogError } = await supabase
      .from("blogs")
      .select("id, competitors")
      .eq("id", blogId)
      .eq("user_id", userId)
      .single();

    if (blogError || !blog) {
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
        console.log("Using cached competitor analysis");
        return new Response(
          JSON.stringify({ analysis: cached }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get user-defined competitors
    const userCompetitors = (blog.competitors as any[]) || [];
    const userCompetitorDomains = userCompetitors.map(c => {
      if (typeof c === 'string') return c.toLowerCase();
      return (c.domain || c.name || c).toLowerCase();
    }).filter(Boolean);

    // Fetch SERP data from DataForSEO
    if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "DataForSEO API not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serpResponse = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live', {
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
      throw new Error(`DataForSEO SERP API error: ${serpResponse.status}`);
    }

    const serpData = await serpResponse.json();
    
    if (serpData.status_code !== 20000) {
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

    // Combine user-defined and SERP competitors
    const allCompetitorDomains = [
      ...userCompetitorDomains,
      ...Array.from(serpCompetitorDomains).filter(d => !userCompetitorDomains.includes(d))
    ];

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
        if (keywordData.status_code === 20000 && keywordData.tasks?.[0]?.result?.[0]) {
          volume = keywordData.tasks[0].result[0].search_volume || 0;
          difficulty = keywordData.tasks[0].result[0].keyword_difficulty || 0;
        }
      }
    } catch (error) {
      console.error("Error fetching keyword metrics:", error);
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

    return new Response(
      JSON.stringify({ analysis }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in analyze-competitor-content:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

