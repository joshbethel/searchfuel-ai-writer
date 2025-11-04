import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow all origins in development
  'Access-Control-Allow-Headers': '*', // Allow all headers in development
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
  'Vary': 'Origin, Access-Control-Request-Headers'
}

const DATAFORSEO_LOGIN = Deno.env.get('DATAFORSEO_LOGIN')
const DATAFORSEO_PASSWORD = Deno.env.get('DATAFORSEO_PASSWORD')

if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
  throw new Error('DataForSEO credentials are not configured')
}

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
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { keywords } = await req.json() as { keywords: string[] }
    
    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('Keywords array is required')
    }

    // Limit the number of keywords to process
    const MAX_KEYWORDS = 200
    if (keywords.length > MAX_KEYWORDS) {
      throw new Error(`Too many keywords. Maximum allowed: ${MAX_KEYWORDS}`)
    }

    // Split keywords into chunks of 100 (DataForSEO limit)
    const chunks: string[][] = []
    for (let i = 0; i < keywords.length; i += 100) {
      chunks.push(keywords.slice(i, i + 100))
    }

    const results: Record<string, SEOStats> = {}

    // Process each chunk
    for (const chunk of chunks) {
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
      
      if (data.status_code !== 200) {
        throw new Error(`DataForSEO API Error: ${data.status_message}`)
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

      // Wait a bit between chunks to respect rate limits
      if (chunks.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    console.error('DataForSEO API Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }), {
        status: 500,
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