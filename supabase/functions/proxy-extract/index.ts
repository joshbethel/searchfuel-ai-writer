
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Comprehensive CORS headers required for browser preflight to succeed
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow all origins in development
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
  'Vary': 'Origin, Access-Control-Request-Headers',
};

const STOPWORDS = new Set([
  'the','and','a','an','in','on','for','with','to','of','is','are','was','were','it','this','that','by','from','as','at','or','be','we','you','your','our'
]);

function normalizeText(text: string) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\n\r]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getNgrams(tokens: string[], n: number) {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    const phrase = tokens.slice(i, i + n).join(' ');
    // Skip phrases with too many stopwords
    const stopwordCount = tokens.slice(i, i + n).filter(t => STOPWORDS.has(t)).length;
    if (stopwordCount < n / 2) {
      out.push(phrase);
    }
  }
  return out;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('', { 
      status: 204, 
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Origin': '*', // Allow all origins in development
        'Access-Control-Allow-Headers': req.headers.get('access-control-request-headers') || '*'
      }
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { blog_post_id, article_id, title: overrideTitle, content: overrideContent } = body;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in function env' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch post or article if id provided
    let title = overrideTitle || '';
    let content = overrideContent || '';
    let postRecord: any = null;

    if (blog_post_id) {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, content, excerpt')
        .eq('id', blog_post_id)
        .single();
      if (error) throw error;
      postRecord = data;
      title = title || (data?.title || '');
      content = content || (data?.content || data?.excerpt || '');
    }

    if (article_id && !postRecord) {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, content')
        .eq('id', article_id)
        .single();
      if (error) throw error;
      postRecord = data;
      title = title || (data?.title || '');
      // articles.content may be JSON; try to extract string
      const artContent = data?.content?.content || data?.content?.main_content || '';
      content = content || artContent || '';
    }

    if (!content && !title) {
      return new Response(JSON.stringify({ error: 'No content or title provided' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const normalizedContent = normalizeText((title + ' ' + content).slice(0, 20000));
    const allTokens = normalizedContent.split(' ').filter(Boolean);
    const tokens = allTokens.filter(t => !STOPWORDS.has(t) && t.length > 2);

    const freq: Record<string, number> = {};
    
    // Count unigrams with better filtering
    for (const unigram of tokens) {
      // Skip pure numbers and single characters
      if (!/^[a-z]+$/.test(unigram) || unigram.length < 3) continue;
      freq[unigram] = (freq[unigram] || 0) + 1;
    }

    // Extract bigrams and trigrams for more context
    const bigrams = getNgrams(tokens, 2);
    for (const bigram of bigrams) {
      if (bigram.length > 5) { // Ensure meaningful phrases
        freq[bigram] = (freq[bigram] || 0) + 3; // Higher weight for phrases
      }
    }
    
    const trigrams = getNgrams(tokens, 3);
    for (const trigram of trigrams) {
      if (trigram.length > 10) { // Ensure meaningful longer phrases
        freq[trigram] = (freq[trigram] || 0) + 4; // Even higher weight for longer phrases
      }
    }

    // Boost title keywords significantly
    const normalizedTitle = normalizeText(title);
    const titleTokens = new Set(normalizedTitle.split(' ').filter(Boolean).filter(t => !STOPWORDS.has(t)));
    for (const t of titleTokens) {
      if (freq[t]) freq[t] = freq[t] * 2.5; // Stronger boost for title keywords
    }
    
    // Boost keywords that appear in first paragraph (more relevant)
    const firstPara = normalizedContent.split('.')[0] || '';
    const firstParaTokens = new Set(firstPara.split(' ').filter(Boolean).filter(t => !STOPWORDS.has(t)));
    for (const t of firstParaTokens) {
      if (freq[t]) freq[t] = freq[t] * 1.3;
    }

    // Create array and sort by score with diversity
    const items = Object.entries(freq).map(([keyword, count]) => ({ keyword, score: count }));
    items.sort((a, b) => b.score - a.score);

    // Keep top 20 for better coverage
    const top = items.slice(0, 20);
    const maxScore = top[0]?.score || 1;
    
    // Filter out very similar keywords to ensure diversity
    const extracted: any[] = [];
    const seenWords = new Set<string>();
    
    for (const it of top) {
      const words = it.keyword.split(' ');
      const mainWord = words[0];
      
      // Skip if we already have a very similar keyword
      if (seenWords.has(mainWord) && words.length === 1) continue;
      
      words.forEach(w => seenWords.add(w));
      extracted.push({ 
        keyword: it.keyword, 
        score: Math.round((it.score / maxScore) * 100) / 100, 
        source: titleTokens.has(it.keyword) ? 'title' : 'body' 
      });
      
      if (extracted.length >= 15) break;
    }

    // Generate diverse recommended topics with better templates
    const topicTemplates = [
      (kw: string) => `${kw.charAt(0).toUpperCase() + kw.slice(1)}: Complete Guide for 2024`,
      (kw: string) => `How to Master ${kw.charAt(0).toUpperCase() + kw.slice(1)}`,
      (kw: string) => `${kw.charAt(0).toUpperCase() + kw.slice(1)}: Best Practices and Tips`,
      (kw: string) => `Understanding ${kw.charAt(0).toUpperCase() + kw.slice(1)}: A Deep Dive`,
      (kw: string) => `${kw.charAt(0).toUpperCase() + kw.slice(1)} Explained: What You Need to Know`,
      (kw: string) => `Top Strategies for ${kw.charAt(0).toUpperCase() + kw.slice(1)}`
    ];
    
    const recommended = extracted.slice(0, 6).map((k: any, i: number) => ({
      topic: topicTemplates[i % topicTemplates.length](k.keyword),
      score: k.score * (1 - i * 0.04),
      reason: `High search potential and relevance to your content`
    }));

    // Fetch SEO data from DataForSEO for all extracted keywords
    try {
      const keywordNames = extracted.map((ex: any) => ex.keyword);
      
      if (keywordNames.length > 0) {
        console.log('Fetching SEO data for keywords:', keywordNames);
        
        // Call the fetch-seo-data function
        const seoResponse = await fetch(`${SUPABASE_URL}/functions/v1/fetch-seo-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ keywords: keywordNames })
        });
        
        if (seoResponse.ok) {
          const seoData = await seoResponse.json();
          console.log('Received SEO data:', Object.keys(seoData).length, 'keywords');
          
          // Enrich extracted keywords with SEO data
          for (const ex of extracted) {
            const stats = seoData[ex.keyword.toLowerCase()];
            if (stats) {
              ex.seoStats = {
                searchVolume: stats.searchVolume || 0,
                keywordDifficulty: stats.keywordDifficulty || 0,
                cpc: stats.cpc || 0,
                competition: stats.competition || 0,
                intent: stats.intent || 'informational',
                trendsData: stats.trendsData || []
              };
              
              // Boost score based on search volume and low difficulty
              if (stats.searchVolume > 0) {
                const volumeBoost = Math.log10(stats.searchVolume + 1) / 5; // Logarithmic boost
                const difficultyPenalty = (stats.keywordDifficulty || 50) / 200; // Penalty for high difficulty
                ex.score = Math.round((ex.score * (1 + volumeBoost - difficultyPenalty)) * 100) / 100;
              }
            }
          }
          
          // Re-sort by enhanced scores
          extracted.sort((a: any, b: any) => b.score - a.score);
          
          // Also enrich recommended topics
          for (const rec of recommended) {
            const baseKw = extracted.find((ex: any) => rec.topic.toLowerCase().includes(ex.keyword.toLowerCase()));
            if (baseKw?.seoStats) {
              (rec as any).seoStats = baseKw.seoStats;
            }
          }
        } else {
          console.warn('SEO data fetch failed:', await seoResponse.text());
        }
      }
    } catch (err) {
      console.warn('Could not fetch SEO data for enrichment:', err);
    }

    // Update DB rows if ids provided. If the DB is missing the JSONB columns
    // we'll catch the Postgres 42703 error and return a helpful error payload
    // that includes the ALTER TABLE SQL you can run (safe IF NOT EXISTS).
    const ALTER_SQL_BLOG = `ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS extracted_keywords JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recommended_topics JSONB DEFAULT '[]'::jsonb;`;
    const ALTER_SQL_ART = `ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS extracted_keywords JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recommended_topics JSONB DEFAULT '[]'::jsonb;`;

    if (postRecord?.id) {
      const { error: updateError } = await supabase
        .from('blog_posts')
        .update({ extracted_keywords: extracted, recommended_topics: recommended })
        .eq('id', postRecord.id);
      if (updateError) {
        console.error('Failed to update blog_posts:', updateError);
  const ue: any = updateError;
  const msg = String(ue?.message || ue?.error || String(ue));
        if (msg.includes('does not exist') || (updateError.code === '42703')) {
          return new Response(JSON.stringify({ error: 'MISSING_COLUMNS', message: msg, sql: ALTER_SQL_BLOG }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    if (article_id) {
      try {
        const { error: artErr } = await supabase
          .from('articles')
          .update({ extracted_keywords: extracted, recommended_topics: recommended })
          .eq('id', article_id);
        if (artErr) {
          console.error('Failed to update articles:', artErr);
          const ae: any = artErr;
          const msg = String(ae?.message || ae?.error || String(ae));
          if (msg.includes('does not exist') || (artErr.code === '42703')) {
            return new Response(JSON.stringify({ error: 'MISSING_COLUMNS', message: msg, sql: ALTER_SQL_ART }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
      } catch (err) {
        console.error('Error updating articles:', err);
      }
    }

    return new Response(JSON.stringify({ success: true, extracted, recommended }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error in proxy-extract function:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
