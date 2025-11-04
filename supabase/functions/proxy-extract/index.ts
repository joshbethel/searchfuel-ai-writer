
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

// Comprehensive stopwords list - common words to filter out
const STOPWORDS = new Set([
  'the','and','a','an','in','on','for','with','to','of','is','are','was','were','it','this','that',
  'by','from','as','at','or','be','we','you','your','our','their','them','they','he','she','i',
  'me','my','mine','his','her','hers','its','us','ours','theirs','will','would','should','could',
  'can','may','might','must','shall','do','does','did','have','has','had','am','been','being',
  'into','through','during','before','after','above','below','up','down','out','off','over','under',
  'again','further','then','once','here','there','when','where','why','how','all','both','each',
  'few','more','most','other','some','such','no','nor','not','only','own','same','so','than',
  'too','very','s','t','just','now','get','got','also','even','well','back','new','way','see',
  'make','take','come','go','know','think','say','tell','give','use','find','want','look','work',
  'feel','try','leave','call','put','mean','keep','let','begin','seem','help','show','need','move',
  'one','two','three','every','much','many','lot','lots','bit','piece','part','end','start',
  'page','post','article','blog','site','website','today','yesterday','tomorrow','day','week','month','year'
]);

// Generic/broad terms to deprioritize for better keyword specificity
const GENERIC_TERMS = new Set([
  'things','something','anything','everything','nothing','stuff','item','items','thing',
  'guide','tips','ways','steps','methods','strategies','techniques','approaches','solutions',
  'best','top','great','good','better','essential','important','key','main','major','primary',
  'complete','comprehensive','ultimate','definitive','perfect','excellent','amazing','awesome',
  'services','parts','material','production','system','process','quality','time','work','people','years'
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
  if (n < 1) return [];
  const out: string[] = [];
  
  for (let i = 0; i + n <= tokens.length; i++) {
    const slice = tokens.slice(i, i + n);
    const phrase = slice.join(' ');
    
    // Minimum phrase length requirement (stricter for quality)
    if (phrase.length < 8) continue;
    
    // Skip if too many stopwords (even stricter)
    const stopwordCount = slice.filter(t => STOPWORDS.has(t)).length;
    if (n === 2 && stopwordCount > 0) continue; // Bigrams: no stopwords
    if (n >= 3 && stopwordCount > 1) continue;  // Longer: max 1 stopword
    
    // Skip if any generic terms for bigrams, max 1 for longer
    const genericCount = slice.filter(t => GENERIC_TERMS.has(t)).length;
    if (n === 2 && genericCount > 0) continue;
    if (n >= 3 && genericCount > 1) continue;
    
    // Each token must be meaningful length
    if (slice.some(t => t.length < 3)) continue;
    
    // Cannot start or end with stopword or generic term
    if (STOPWORDS.has(slice[0]) || STOPWORDS.has(slice[n - 1])) continue;
    if (GENERIC_TERMS.has(slice[0]) || GENERIC_TERMS.has(slice[n - 1])) continue;
    
    // Require at least one substantial word (5+ chars)
    const hasSubstantialWord = slice.some(t => 
      !GENERIC_TERMS.has(t) && 
      !STOPWORDS.has(t) && 
      t.length >= 5
    );
    if (!hasSubstantialWord) continue;
    
    // For 3+ word phrases, require at least TWO specific terms
    if (n >= 3) {
      const specificTerms = slice.filter(t => 
        !GENERIC_TERMS.has(t) && 
        !STOPWORDS.has(t) && 
        t.length > 3
      );
      if (specificTerms.length < 2) continue;
    }
    
    // Skip phrases that are too long or have too many words
    if (phrase.length > 45 || n > 4) continue;
    
    out.push(phrase);
  }
  return out;
}

// Check if keyword is SEO-worthy based on structure and potential
function isQualityKeyword(keyword: string): boolean {
  const words = keyword.split(' ');
  const wordCount = words.length;
  
  // Minimum length requirements (stricter)
  if (keyword.length < 8) return false;
  
  // Require 2-4 word phrases (NO single words)
  if (wordCount < 2 || wordCount > 4) return false;
  
  // Each word must be meaningful
  if (words.some(w => w.length < 3)) return false;
  
  // Must have at least one substantial word (6+ chars)
  const hasSubstantialWord = words.some(w => 
    w.length >= 6 && 
    !GENERIC_TERMS.has(w) && 
    !STOPWORDS.has(w)
  );
  if (!hasSubstantialWord) return false;
  
  // Cannot start or end with generic/stopword
  if (STOPWORDS.has(words[0]) || STOPWORDS.has(words[words.length - 1])) return false;
  if (GENERIC_TERMS.has(words[0]) || GENERIC_TERMS.has(words[words.length - 1])) return false;
  
  // For 3+ words, need at least 2 specific meaningful terms
  if (wordCount >= 3) {
    const specificWords = words.filter(w => 
      !GENERIC_TERMS.has(w) && 
      !STOPWORDS.has(w) && 
      w.length >= 4
    );
    if (specificWords.length < 2) return false;
  }
  
  // Reject if mostly numbers or special patterns
  if (!/^[a-z\s]+$/.test(keyword)) return false;
  
  return true;
}

// Helper: Calculate Jaccard similarity between two keywords (0-1 range)
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(' '));
  const wordsB = new Set(b.toLowerCase().split(' '));
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(undefined, { 
      status: 204, 
      headers: corsHeaders
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

    // Skip unigrams entirely - only use multi-word phrases

    // 2. Bigrams - BEST for SEO (sweet spot for ranking)
    const bigrams = getNgrams(filteredTokens, 2);
    const bigramFreq: Record<string, number> = {};
    for (const bg of bigrams) {
      bigramFreq[bg] = (bigramFreq[bg] || 0) + 1;
    }
    for (const [kw, freq] of Object.entries(bigramFreq)) {
      // Only accept high-quality bigrams (already filtered in getNgrams)
      if (kw.length >= 8) {
        candidates.push({ keyword: kw, score: freq * 5.0, source: 'body' });
      }
    }

    // 3. Trigrams - excellent for specific long-tail
    const trigrams = getNgrams(filteredTokens, 3);
    const trigramFreq: Record<string, number> = {};
    for (const tg of trigrams) {
      trigramFreq[tg] = (trigramFreq[tg] || 0) + 1;
    }
    for (const [kw, freq] of Object.entries(trigramFreq)) {
      if (kw.length >= 10) {
        candidates.push({ keyword: kw, score: freq * 8.0, source: 'body' });
      }
    }

    // 4. 4-grams - very specific long-tail (use sparingly)
    const fourgrams = getNgrams(filteredTokens, 4);
    const fourgramFreq: Record<string, number> = {};
    for (const fg of fourgrams) {
      fourgramFreq[fg] = (fourgramFreq[fg] || 0) + 1;
    }
    for (const [kw, freq] of Object.entries(fourgramFreq)) {
      if (kw.length >= 12) {
        candidates.push({ keyword: kw, score: freq * 10.0, source: 'body' });
      }
    }

    // ===== Strategic placement boosts (improved weighting) =====
    const titleTokens = new Set(titleNorm.split(' ').filter(Boolean));
    const headingTokens = new Set(headingsText.split(' ').filter(Boolean));
    const firstParaTokens = new Set(firstPara.split(' ').filter(Boolean));
    
    for (const c of candidates) {
      const kwTokens = c.keyword.split(' ');
      
      // TITLE: Most important signal - exact match gets highest boost
      if (titleNorm.includes(c.keyword)) {
        c.score *= 5.0;  // Full phrase in title
        c.source = 'title';
      } else if (kwTokens.some(t => titleTokens.has(t))) {
        c.score *= 3.0;  // Partial match in title
        c.source = 'title';
      }
      // HEADINGS: Strong signal of topic importance
      else if (headingsText.includes(c.keyword)) {
        c.score *= 3.5;  // Full phrase in heading
        c.source = 'heading';
      } else if (kwTokens.some(t => headingTokens.has(t))) {
        c.score *= 2.2;  // Partial match in heading
        c.source = 'heading';
      }
      // FIRST PARAGRAPH: Good signal for main topic
      else if (firstPara.includes(c.keyword)) {
        c.score *= 2.0;  // Full phrase in intro
        c.source = 'intro';
      } else if (kwTokens.some(t => firstParaTokens.has(t))) {
        c.score *= 1.5;  // Partial match in intro
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
          
          // Filter to only quality, rankable keywords with deduplication
          const seenSimilar = new Set<string>();
          const qualityKeywords = topCandidates.filter((kw: any) => {
            // First check: is it structurally a quality keyword?
            if (!isQualityKeyword(kw.keyword)) return false;
            
            // Check for similarity with already-selected keywords
            for (const seen of seenSimilar) {
              const similarity = calculateSimilarity(kw.keyword, seen);
              if (similarity > 0.75) return false;  // Too similar, skip
            }
            
            // If has SEO stats, apply stricter filters
            if (kw.seoStats) {
              // Must have minimum search volume (stricter)
              if (!kw.seoStats.searchVolume || kw.seoStats.searchVolume < 100) return false;
              
              // Prefer lower difficulty (if available)
              if (kw.seoStats.keywordDifficulty && kw.seoStats.keywordDifficulty > 80) return false;
              
              // Avoid pure navigational with low volume
              if (kw.seoStats.intent === 'navigational' && kw.seoStats.searchVolume < 500) return false;
            }
            
            seenSimilar.add(kw.keyword);
            return true;
          });
          
          // Re-sort by enhanced scores, prioritizing quality long-tail keywords
          qualityKeywords.sort((a: any, b: any) => {
            const aWords = a.keyword.split(' ').length;
            const bWords = b.keyword.split(' ').length;
            
            // Strongly prefer 2-3 word phrases (SEO sweet spot)
            if (aWords >= 2 && aWords <= 3 && bWords === 1) return -1;
            if (bWords >= 2 && bWords <= 3 && aWords === 1) return 1;
            
            // Within same word count, prefer keywords with better metrics
            if (aWords === bWords && a.seoStats && b.seoStats) {
              // Calculate ranking potential score
              const aRankScore = (a.seoStats.searchVolume || 0) / Math.max(1, a.seoStats.keywordDifficulty || 50);
              const bRankScore = (b.seoStats.searchVolume || 0) / Math.max(1, b.seoStats.keywordDifficulty || 50);
              if (Math.abs(aRankScore - bRankScore) > 10) {
                return bRankScore - aRankScore;
              }
            }
            
            return b.score - a.score;
          });
          
          // Take top 30 diverse, high-quality keywords (increased coverage)
          extracted = qualityKeywords.slice(0, 30);
          
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
