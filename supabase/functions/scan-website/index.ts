import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { getCorsHeaders } from "../_shared/cors.ts";
import { validateUrl } from "../_shared/url-validation.ts";

// Extract text content from HTML
function extractTextFromHTML(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Extract title
  const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : '';
  
  // Extract meta description
  const descMatch = text.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const description = descMatch ? descMatch[1] : '';
  
  // Extract headings
  const h1Matches = text.match(/<h1[^>]*>([^<]+)<\/h1>/gi) || [];
  const h2Matches = text.match(/<h2[^>]*>([^<]+)<\/h2>/gi) || [];
  const headings = [...h1Matches, ...h2Matches].map(h => h.replace(/<[^>]+>/g, ''));
  
  // Extract paragraph content
  const pMatches = text.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
  const paragraphs = pMatches.slice(0, 10).map(p => p.replace(/<[^>]+>/g, ''));
  
  return JSON.stringify({
    title,
    description,
    headings: headings.slice(0, 10),
    content: paragraphs.slice(0, 5).join(' ').slice(0, 1000)
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    
    // Validate URL to prevent SSRF attacks (with DNS resolution)
    const urlValidation = await validateUrl(url);
    if (!urlValidation.isValid) {
      return new Response(
        JSON.stringify({ 
          error: urlValidation.error || 'Invalid URL',
          details: 'The provided URL is not allowed for security reasons'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Get auth header and create Supabase clients
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader! } }
    });
    // Service role client for subscription queries (bypasses RLS)
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Try to get user from auth (optional for public scans)
    const { data: { user } } = await supabase.auth.getUser();
    const isAuthenticated = !!user;
    
    console.log('Scanning website:', url, isAuthenticated ? 'with authenticated user' : 'as public user');

    // Fetch the actual website content
    let websiteContent = '';
    let websiteData: any = {};
    
    try {
      const websiteResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SearchFuel/1.0; +https://searchfuel.app)'
        }
      });
      
      if (websiteResponse.ok) {
        const html = await websiteResponse.text();
        websiteContent = extractTextFromHTML(html);
        websiteData = JSON.parse(websiteContent);
        console.log('Successfully fetched website content:', websiteData.title);
      }
    } catch (fetchError) {
      console.error('Error fetching website:', fetchError);
      // Continue without website content if fetch fails
    }

    const systemPrompt = `You are an expert SEO analyst specializing in location-aware keyword research.

STEP 1: Analyze the website and identify:
- Business location (city, state, region, country)
- Service area (local business, regional, national, or international)
- Geographic signals in the content, contact info, or address
- Industry and business type

STEP 2: Generate 5-10 blog post ideas that:
1. Match the business's ACTUAL geographic scope
2. Target keywords relevant to their SERVICE AREA ONLY
3. Help the site rank higher in search engines for their target location
4. Drive conversions and qualified traffic

CRITICAL LOCATION RULES:
- For LOCAL businesses (serve one city/region): Generate ONLY location-specific keywords for their area
- For REGIONAL businesses: Target ONLY the states/regions they actually serve
- For NATIONAL businesses: Use broader keywords without conflicting geographic terms
- For INTERNATIONAL businesses: Consider global keywords or multi-country strategies

DO NOT generate keywords for locations the business doesn't serve.
DO NOT suggest NYC keywords for a Missouri business.
DO NOT suggest California keywords for an East Coast business.

Website Information:
${websiteContent || 'URL: ' + url}

For each blog idea, provide:
- title: A compelling blog post title that targets a specific keyword
- keyword: The primary target keyword (2-4 words) appropriate for their service area
- intent: Either "informational", "commercial", or "transactional"
- reason: A short explanation (1-2 sentences) of why this topic is valuable for SEO and conversions in their target market

Return ONLY a valid JSON array of blog ideas. No markdown, no explanation, just the JSON array.`;

    const userPrompt = websiteData.title 
      ? `Based on the website "${websiteData.title}" with description "${websiteData.description}", suggest 5-10 SEO-optimized blog topics that complement the existing content: ${websiteData.headings.join(', ')}`
      : `Analyze this website and suggest 5-10 SEO-optimized blog topics: ${url}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error('Failed to analyze website');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse the JSON response
    let blogIdeas;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      blogIdeas = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Invalid response format from AI');
    }

    // Add unique IDs to each idea
    const ideasWithIds = blogIdeas.map((idea: any, index: number) => ({
      ...idea,
      id: `idea-${Date.now()}-${index}`
    }));

    console.log('Successfully generated blog ideas:', ideasWithIds.length);

    // Only save to database if user is authenticated
    if (isAuthenticated && user) {
      console.log('Saving keywords to database for authenticated user');
      
      // Save keywords to database
      const keywordsToInsert = ideasWithIds.map((idea: any) => ({
        user_id: user.id,
        keyword: idea.keyword,
        intent: idea.intent,
        search_volume: 0, // Default value, can be updated later with real data
        cpc: 0, // Default value, can be updated later with real data
        difficulty: null,
        competition: null,
        trend: null,
      }));

      // Check usage limit before inserting keywords
      const { data: canAdd, error: limitError } = await supabase
        .rpc('can_add_keyword', { user_uuid: user.id });

      if (limitError) {
        console.error('Error checking keyword limit:', limitError);
        throw new Error('Failed to check keyword limit');
      }

      // Check if the number of keywords to insert exceeds the limit
      const { count: currentCount } = await supabase
        .from('keywords')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const currentKeywordCount = currentCount || 0;
      const newTotalCount = keywordsToInsert.length; // Since we're replacing all

      // Get user's subscription to check limit (use service role to bypass RLS)
      const { data: subscription } = await supabaseService
        .from('subscriptions')
        .select('id, plan_name, keywords_count')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      const maxKeywords = subscription?.plan_name === 'pro' ? 100 : 10;

      if (newTotalCount > maxKeywords) {
        throw new Error(`You can only have ${maxKeywords} keywords. You're trying to add ${newTotalCount}. Please upgrade your plan or reduce the number of keywords.`);
      }

      // Delete existing keywords for this user first to avoid duplicates
      await supabase
        .from('keywords')
        .delete()
        .eq('user_id', user.id);

      // Insert new keywords
      const { error: insertError } = await supabase
        .from('keywords')
        .insert(keywordsToInsert);

      if (insertError) {
        console.error('Error inserting keywords:', insertError);
        throw new Error('Failed to save keywords to database');
      }

      // Update keyword count in subscriptions table
      if (subscription) {
        await supabaseService
          .from('subscriptions')
          .update({ keywords_count: newTotalCount })
          .eq('id', subscription.id);
      }

      console.log('Successfully saved keywords to database');

      // Now fetch real keyword metrics from DataForSEO
      try {
        const keywords = ideasWithIds.map((idea: any) => idea.keyword);
        
        console.log('Fetching keyword metrics from DataForSEO for:', keywords);

        const DATAFORSEO_LOGIN = Deno.env.get('DATAFORSEO_LOGIN');
        const DATAFORSEO_PASSWORD = Deno.env.get('DATAFORSEO_PASSWORD');

        if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
          console.error('DataForSEO credentials not configured');
          throw new Error('DataForSEO credentials not configured');
        }

        // Call DataForSEO API
        const authString = btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);
        const dataforSEOPayload = [
          {
            location_code: 2840,
            language_code: 'en',
            keywords,
          },
        ];

        const dataforSEOResponse = await fetch(
          'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live',
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${authString}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(dataforSEOPayload),
          }
        );

        if (dataforSEOResponse.ok) {
          const dataforSEOData = await dataforSEOResponse.json();
          
          if (dataforSEOData.status_code === 20000) {
            console.log('Successfully fetched keyword metrics from DataForSEO');

            // Process results and update keywords
            const tasks = dataforSEOData.tasks || [];
            const keywordsToUpdate = [];

            for (const task of tasks) {
              if (!task.result) continue;

              for (const keywordData of task.result) {
                // Determine keyword intent based on keyword content
                let intent = 'informational';
                const kw = keywordData.keyword.toLowerCase();
                
                if (kw.includes('buy') || kw.includes('price') || kw.includes('cost') || kw.includes('cheap')) {
                  intent = 'commercial';
                } else if (kw.includes('near me') || kw.includes('how to') || kw.includes('installation')) {
                  intent = 'transactional';
                } else if (kw.includes('best') || kw.includes('review') || kw.includes('vs')) {
                  intent = 'commercial';
                }

                // Calculate difficulty (0-100 scale based on competition)
                const difficulty = keywordData.competition 
                  ? Math.round(keywordData.competition * 100) 
                  : null;

                // Determine trend based on monthly searches if available
                let trend = 'stable';
                if (keywordData.monthly_searches && keywordData.monthly_searches.length >= 2) {
                  const recent = keywordData.monthly_searches.slice(-3);
                  const older = keywordData.monthly_searches.slice(-6, -3);
                  const recentAvg = recent.reduce((sum: number, m: any) => sum + (m.search_volume || 0), 0) / recent.length;
                  const olderAvg = older.reduce((sum: number, m: any) => sum + (m.search_volume || 0), 0) / older.length;
                  
                  if (recentAvg > olderAvg * 1.1) trend = 'up';
                  else if (recentAvg < olderAvg * 0.9) trend = 'down';
                }

                keywordsToUpdate.push({
                  user_id: user.id,
                  keyword: keywordData.keyword,
                  search_volume: keywordData.search_volume || 0,
                  cpc: keywordData.cpc || 0,
                  competition: keywordData.competition || null,
                  difficulty,
                  intent,
                  trend,
                  location_code: 2840,
                  language_code: 'en',
                });
              }
            }

            // Update keywords with real data
            if (keywordsToUpdate.length > 0) {
              const { error: updateError } = await supabase
                .from('keywords')
                .upsert(keywordsToUpdate, {
                  onConflict: 'user_id,keyword,location_code',
                  ignoreDuplicates: false,
                });

              if (updateError) {
                console.error('Error updating keywords with metrics:', updateError);
              } else {
                console.log(`Successfully updated ${keywordsToUpdate.length} keywords with real metrics`);
              }
            }
          } else {
            console.error('DataForSEO API error:', dataforSEOData.status_message);
          }
        } else {
          const errorText = await dataforSEOResponse.text();
          const statusCode = dataforSEOResponse.status;
          
          if (statusCode === 402) {
            console.error('DataForSEO API - Payment Required (402). Keyword metrics will show default values.');
            console.log('Keywords saved without metrics. DataForSEO account needs funding for full data.');
          } else {
            console.error('DataForSEO API request failed:', statusCode, errorText);
          }
        }
      } catch (dataforSEOError) {
        // Log error but don't fail the entire request
        console.error('Error fetching keyword metrics from DataForSEO:', dataforSEOError);
        // Keywords are already saved with default values, so continue
      }
    } else {
      console.log('Skipping database operations for unauthenticated user');
    }

    return new Response(
      JSON.stringify({ blogIdeas: ideasWithIds }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scan-website function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
