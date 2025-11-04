
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

// Expanded stopwords + generic terms to filter out
const STOPWORDS = new Set([
  'the','and','a','an','in','on','for','with','to','of','is','are','was','were','it','this','that','by','from','as','at','or','be','we','you','your','our',
  'has','have','had','will','can','may','more','most','some','such','very','than','then','these','those','into','over','only','also','other','any','all'
]);

// Generic words to deprioritize (too broad for good ranking)
const GENERIC_TERMS = new Set([
  'services','parts','material','production','system','process','quality','time','work','way','things','people','years','today'
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

// Extract headings separately for bonus weighting
function extractHeadings(html: string): string[] {
  const headings: string[] = [];
  const h2Matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [];
  const h3Matches = html.match(/<h3[^>]*>(.*?)<\/h3>/gi) || [];
  
  [...h2Matches, ...h3Matches].forEach(match => {
    const text = match.replace(/<[^>]+>/g, ' ').trim();
    if (text) headings.push(text.toLowerCase());
  });
  
  return headings;
}

function getNgrams(tokens: string[], n: number) {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    const slice = tokens.slice(i, i + n);
    const phrase = slice.join(' ');
    
    // Skip phrases with too many stopwords
    const stopwordCount = slice.filter(t => STOPWORDS.has(t)).length;
    if (stopwordCount >= Math.ceil(n / 2)) continue;
    
    // Skip if starts or ends with stopword
    if (STOPWORDS.has(slice[0]) || STOPWORDS.has(slice[slice.length - 1])) continue;
    
    // For longer phrases (3-4 words), prefer those with at least one specific term
    if (n >= 3) {
      const hasSpecificTerm = slice.some(t => !GENERIC_TERMS.has(t) && !STOPWORDS.has(t) && t.length > 3);
      if (!hasSpecificTerm) continue;
    }
    
    out.push(phrase);
  }
  return out;
}

// Check if keyword is SEO-worthy based on metrics
function isRankableKeyword(keyword: string, stats: any): boolean {
  // Must have some search volume
  if (!stats?.searchVolume || stats.searchVolume < 100) return false;
  
  // Prefer lower difficulty (easier to rank)
  if (stats.keywordDifficulty && stats.keywordDifficulty > 70) return false;
  
  // Prefer commercial/informational intent over navigational
  if (stats.intent === 'navigational' && stats.searchVolume < 1000) return false;
  
  return true;
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

    const bodyText = typeof content === 'string' ? content : JSON.stringify(content);
    
    // ===== Extract and normalize content =====
    const titleNorm = normalizeText(title);
    const bodyNorm = normalizeText(bodyText);
    const firstPara = bodyNorm.split('.')[0] || '';
    const headings = extractHeadings(bodyText);
    const headingsText = headings.join(' ');
    
    const allText = titleNorm + ' ' + bodyNorm;
    const allTokens = allText.split(/\s+/).filter(Boolean);
    const filteredTokens = allTokens.filter(t => !STOPWORDS.has(t) && t.length > 2);

    // ===== Build candidate keywords with frequency scoring =====
    const candidates: Array<{ keyword: string; score: number; source: string }> = [];

    // 1. Unigrams - only meaningful, non-generic words
    const unigramFreq: Record<string, number> = {};
    for (const tok of filteredTokens) {
      if (GENERIC_TERMS.has(tok) || tok.length < 5) continue;
      if (!/^[a-z]+$/.test(tok)) continue; // Skip numbers/special chars
      unigramFreq[tok] = (unigramFreq[tok] || 0) + 1;
    }
    for (const [kw, freq] of Object.entries(unigramFreq)) {
      candidates.push({ keyword: kw, score: freq * 0.3, source: 'body' });
    }

    // 2. Bigrams - valuable for SEO
    const bigrams = getNgrams(filteredTokens, 2);
    const bigramFreq: Record<string, number> = {};
    for (const bg of bigrams) {
      bigramFreq[bg] = (bigramFreq[bg] || 0) + 1;
    }
    for (const [kw, freq] of Object.entries(bigramFreq)) {
      const hasGeneric = kw.split(' ').some(w => GENERIC_TERMS.has(w));
      const scoreMultiplier = hasGeneric ? 1.2 : 2.5;
      candidates.push({ keyword: kw, score: freq * scoreMultiplier, source: 'body' });
    }

    // 3. Trigrams - excellent for long-tail SEO
    const trigrams = getNgrams(filteredTokens, 3);
    const trigramFreq: Record<string, number> = {};
    for (const tg of trigrams) {
      trigramFreq[tg] = (trigramFreq[tg] || 0) + 1;
    }
    for (const [kw, freq] of Object.entries(trigramFreq)) {
      candidates.push({ keyword: kw, score: freq * 3.5, source: 'body' });
    }

    // 4. 4-grams - very specific long-tail keywords
    const fourgrams = getNgrams(filteredTokens, 4);
    const fourgramFreq: Record<string, number> = {};
    for (const fg of fourgrams) {
      fourgramFreq[fg] = (fourgramFreq[fg] || 0) + 1;
    }
    for (const [kw, freq] of Object.entries(fourgramFreq)) {
      candidates.push({ keyword: kw, score: freq * 4.5, source: 'body' });
    }

    // ===== Strategic placement boosts =====
    for (const c of candidates) {
      // Title keywords get massive boost
      if (titleNorm.includes(c.keyword)) {
        c.score *= 4.5;
        c.source = 'title';
      }
      // Heading keywords get strong boost
      else if (headingsText.includes(c.keyword)) {
        c.score *= 3.5;
        c.source = 'heading';
      }
      // First paragraph gets good boost
      else if (firstPara.includes(c.keyword)) {
        c.score *= 2.5;
        c.source = 'intro';
      }
    }

    // ===== Deduplicate and get top candidates =====
    const keywordMap = new Map<string, typeof candidates[0]>();
    for (const c of candidates) {
      const existing = keywordMap.get(c.keyword);
      if (!existing || c.score > existing.score) {
        keywordMap.set(c.keyword, c);
      }
    }
    const uniqCandidates = Array.from(keywordMap.values());

    // Sort by score
    uniqCandidates.sort((a, b) => b.score - a.score);
    const topCandidates = uniqCandidates.slice(0, 40); // Get more candidates before filtering


    // Fetch SEO data from DataForSEO for all candidates
    let extracted: any[] = [];
    try {
      const keywordNames = topCandidates.map((c: any) => c.keyword);
      
      if (keywordNames.length > 0) {
        console.log('Fetching SEO data for', keywordNames.length, 'keyword candidates');
        
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
          console.log('Received SEO data for', Object.keys(seoData).length, 'keywords');
          
          // Enrich candidates with SEO data and boost scores
          for (const c of topCandidates) {
            const stats = seoData[c.keyword.toLowerCase()];
            if (stats) {
              (c as any).seoStats = {
                searchVolume: stats.searchVolume || 0,
                keywordDifficulty: stats.keywordDifficulty || 0,
                cpc: stats.cpc || 0,
                competition: stats.competition || 0,
                intent: stats.intent || 'informational',
                trendsData: stats.trendsData || []
              };
              
              // Major boost for sweet spot: decent volume + low difficulty
              if (stats.searchVolume >= 500 && stats.keywordDifficulty < 40) {
                c.score *= 2.2;
              }
              
              // Boost for search volume tiers
              if (stats.searchVolume > 50000) c.score *= 1.9;
              else if (stats.searchVolume > 10000) c.score *= 1.7;
              else if (stats.searchVolume > 5000) c.score *= 1.5;
              else if (stats.searchVolume > 1000) c.score *= 1.3;
              else if (stats.searchVolume > 500) c.score *= 1.1;
              
              // Boost for lower difficulty (easier to rank)
              if (stats.keywordDifficulty < 20) c.score *= 1.6;
              else if (stats.keywordDifficulty < 40) c.score *= 1.4;
              else if (stats.keywordDifficulty < 60) c.score *= 1.2;
              
              // Boost for commercial/informational intent
              if (stats.intent === 'commercial') c.score *= 1.6;
              else if (stats.intent === 'informational') c.score *= 1.5;
              else if (stats.intent === 'transactional') c.score *= 1.3;
            }
          }
          
          // Filter to only rankable keywords with good metrics
          const rankableKeywords = topCandidates.filter((kw: any) => {
            // Keep keywords with SEO stats that pass rankability check
            if (kw.seoStats && isRankableKeyword(kw.keyword, kw.seoStats)) return true;
            
            // Keep multi-word keywords even without stats (likely long-tail)
            if (kw.keyword.split(' ').length >= 2) return true;
            
            // Single words must have stats or be very specific
            return kw.keyword.length > 6;
          });
          
          // Re-sort by enhanced scores, prioritizing longer phrases
          rankableKeywords.sort((a: any, b: any) => {
            const aWords = a.keyword.split(' ').length;
            const bWords = b.keyword.split(' ').length;
            
            // Prefer 2-4 word phrases over single words
            if (aWords >= 2 && aWords <= 4 && bWords === 1) return -1;
            if (bWords >= 2 && bWords <= 4 && aWords === 1) return 1;
            
            return b.score - a.score;
          });
          
          // Take top 20 keywords
          extracted = rankableKeywords.slice(0, 20);
          
          // Normalize scores to 0-1 range
          const maxScore = extracted[0]?.score || 1;
          extracted.forEach((kw: any) => {
            kw.score = Math.round((kw.score / maxScore) * 100) / 100;
          });
          
          console.log('Final processed data:', { keywords: extracted.slice(0, 5) });
        } else {
          console.warn('SEO data fetch failed:', await seoResponse.text());
          // Fallback to topCandidates without SEO enrichment
          extracted = topCandidates.slice(0, 15);
        }
      }
    } catch (err) {
      console.warn('Could not fetch SEO data for enrichment:', err);
      // Fallback to topCandidates without SEO enrichment
      extracted = topCandidates.slice(0, 15);
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
    
    const recommended = extracted.slice(0, 6).map((k: any, i: number) => {
      const rec: any = {
        topic: topicTemplates[i % topicTemplates.length](k.keyword),
        score: k.score * (1 - i * 0.04),
        reason: `High search potential and relevance to your content`
      };
      
      // Copy SEO stats if available
      if (k.seoStats) {
        rec.seoStats = k.seoStats;
      }
      
      return rec;
    });

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
