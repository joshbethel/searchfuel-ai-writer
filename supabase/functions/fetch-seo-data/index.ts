import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from "../_shared/cors.ts"
import { 
  fetchSeoDataSchema, 
  safeValidateRequest, 
  createValidationErrorResponse 
} from "../_shared/validation.ts"

const DATAFORSEO_LOGIN = Deno.env.get('DATAFORSEO_LOGIN')
const DATAFORSEO_PASSWORD = Deno.env.get('DATAFORSEO_PASSWORD')

interface SEOStats {
  searchVolume?: number;
  keywordDifficulty?: number;
  cpc?: number;
  competition?: number;
  intent?: 'informational' | 'commercial' | 'transactional' | 'navigational';
  trendsData?: Array<{ month: string; volume: number }>;
}

// Handle CORS preflight
serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // CRITICAL SECURITY: Authenticate user first
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
    console.log(`Authenticated user: ${userId} - Fetching SEO data`);
    
    // Check if DataForSEO credentials are configured
    if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
      console.error('DataForSEO credentials not configured');
      return new Response(
        JSON.stringify({ error: 'DataForSEO API is not configured. SEO stats unavailable.' }),
        {
          status: 200, // Return 200 so client doesn't fail, just no stats
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Validate request body with Zod schema
    const requestBody = await req.json();
    const validationResult = safeValidateRequest(fetchSeoDataSchema, requestBody);
    
    if (!validationResult.success) {
      return createValidationErrorResponse(validationResult, corsHeaders);
    }

    const { keywords } = validationResult.data;
    console.log('Fetching SEO data for', keywords.length, 'keywords');

    // Limit the number of keywords to process
    const MAX_KEYWORDS = 100; // Reduced to avoid rate limits
    const limitedKeywords = keywords.slice(0, MAX_KEYWORDS);
    
    if (keywords.length > MAX_KEYWORDS) {
      console.warn(`Limiting keywords from ${keywords.length} to ${MAX_KEYWORDS}`);
    }

    // Split keywords into chunks of 50 (safer for API limits)
    const chunks: string[][] = []
    for (let i = 0; i < limitedKeywords.length; i += 50) {
      chunks.push(limitedKeywords.slice(i, i + 50))
    }

    const results: Record<string, SEOStats> = {}

    // Process each chunk
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(`Processing chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length} keywords`);
      
      const response = await fetch('https://api.dataforseo.com/v3/keywords_data/google/search_volume/live', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
          location_name: "United States",
          keywords: chunk
        }])
      })

      const data = await response.json()
      
      console.log('DataForSEO response status:', data.status_code);
      
      if (data.status_code !== 20000) {
        console.error('DataForSEO API Error:', data.status_message);
        // Continue with empty results instead of failing completely
        continue;
      }

      interface MonthlySearch {
        month: string;
        search_volume: number;
      }

      interface DataForSEOResult {
        keyword: string;
        // Fields for search_volume endpoint
        search_volume?: number;
        cpc?: number;
        competition_level?: string | number;
        monthly_searches?: MonthlySearch[];
        // Optional fields from other endpoints (kept for flexibility)
        keyword_difficulty?: number;
        competition?: number | string;
        keyword_info?: {
          search_volume?: number;
          cpc?: number;
          competition?: number | string;
          monthly_searches?: MonthlySearch[];
        };
        title?: string;
        description?: string;
      }

      interface DataForSEOTask {
        result: DataForSEOResult[];
      }

      interface DataForSEOResponse {
        status_code: number;
        status_message?: string;
        tasks: DataForSEOTask[];
      }

      // Process results
      const apiData = data as DataForSEOResponse;
      
      if (apiData.tasks) {
        for (const task of apiData.tasks) {
          for (const result of task.result) {
            const keyword = result.keyword.toLowerCase();
            
            // Extract data from either direct fields or keyword_info object
            const searchVolume = result.search_volume ?? result.keyword_info?.search_volume;
            const cpc = result.cpc ?? result.keyword_info?.cpc;
            const competition: any = result.competition_level ?? result.competition ?? result.keyword_info?.competition;
            const monthlySearches = result.monthly_searches ?? result.keyword_info?.monthly_searches;
            
            // Convert competition level to numeric difficulty (0-100)
            let difficulty = result.keyword_difficulty ?? 50; // default to medium
            if (competition && typeof competition === 'string') {
              const compLower = competition.toLowerCase();
              if (compLower === 'low') difficulty = 25;
              else if (compLower === 'medium') difficulty = 50;
              else if (compLower === 'high') difficulty = 75;
            } else if (competition && typeof competition === 'number') {
              // If it's already a number (0-1 range), convert to 0-100
              difficulty = Math.round(competition * 100);
            }
            
            results[keyword] = {
              searchVolume: searchVolume,
              keywordDifficulty: difficulty,
              cpc: cpc,
              competition: competition,
              intent: determineIntent(result),
              trendsData: monthlySearches?.map((m: MonthlySearch) => ({
                month: m.month,
                volume: m.search_volume
              }))
            }
          }
        }
      }

      // Wait between chunks to respect rate limits
      if (chunkIndex < chunks.length - 1) {
        console.log('Waiting 2s before next chunk...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`Successfully fetched SEO data for ${Object.keys(results).length} keywords`);
    
    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    console.error('fetch-seo-data error:', error)
    // Return empty object instead of error to prevent client-side failures
    return new Response(
      JSON.stringify({}), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

function determineIntent(result: any): 'informational' | 'commercial' | 'transactional' | 'navigational' {
  const title = result.title?.toLowerCase() || ''
  const desc = result.description?.toLowerCase() || ''
  
  if (title.includes('buy') || title.includes('price') || desc.includes('shop') || desc.includes('purchase')) {
    return 'transactional'
  }
  if (title.includes('vs') || title.includes('best') || desc.includes('compare')) {
    return 'commercial'
  }
  if (title.includes('how') || title.includes('what') || title.includes('why') || desc.includes('learn')) {
    return 'informational'
  }
  return 'navigational'
}