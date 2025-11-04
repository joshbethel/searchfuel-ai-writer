import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('fetch-seo-data function called');
    
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
    
    const { keywords } = await req.json() as { keywords: string[] }
    console.log('Fetching SEO data for', keywords.length, 'keywords');
    
    if (!Array.isArray(keywords) || keywords.length === 0) {
      console.log('No keywords provided, returning empty result');
      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
        search_volume?: number;
        keyword_difficulty?: number;
        cpc?: number;
        competition_level?: number;
        monthly_searches?: MonthlySearch[];
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
            const keyword = result.keyword.toLowerCase()
            results[keyword] = {
              searchVolume: result.search_volume,
              keywordDifficulty: result.keyword_difficulty,
              cpc: result.cpc,
              competition: result.competition_level,
              intent: determineIntent(result),
              trendsData: result.monthly_searches?.map((m: MonthlySearch) => ({
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