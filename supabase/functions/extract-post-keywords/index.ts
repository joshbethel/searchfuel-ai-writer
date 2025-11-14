
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { 
  extractPostKeywordsSchema, 
  safeValidateRequest, 
  createValidationErrorResponse 
} from "../_shared/validation.ts";

// Comprehensive stopword list for English
const STOPWORDS = new Set([
  'the','and','a','an','in','on','for','with','to','of','is','are','was','were','it','this','that',
  'by','from','as','at','or','be','we','you','your','our','their','them','they','he','she','i',
  'me','my','mine','his','her','hers','its','us','ours','theirs','will','would','should','could',
  'can','may','might','must','shall','do','does','did','have','has','had','am','been','being',
  'into','through','during','before','after','above','below','up','down','out','off','over','under',
  'again','further','then','once','here','there','when','where','why','how','all','both','each',
  'few','more','most','other','some','such','no','nor','not','only','own','same','so','than',
  'too','very','just','now','get','got','also','even','well','back','new','way','see',
  'make','take','come','go','know','think','say','tell','give','use','find','want','look','work'
]);

// Generic single-word terms that should only appear in multi-word phrases
const GENERIC_TERMS = new Set([
  'calculator','investment','financial','future','management','debt','savings','planning',
  'money','budget','loan','credit','interest','rate','account','tax','income','expense',
  'retirement','wealth','portfolio','fund','stock','bond','insurance','mortgage','payment',
  'guide','tips','ways','steps','methods','strategies','techniques','approaches','solutions',
  'best','top','great','good','better','essential','important','key','main','major','primary',
  'things','something','anything','everything','system','process','quality','time','people','years',
  'project','success','team','resources','high','medium','low','priority','phase','checklist'
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
    const slice = tokens.slice(i, i + n);
    const phrase = slice.join(' ');
    
    // Minimum phrase length
    if (phrase.length < 8) continue;
    
    // Skip if too many stopwords
    const stopwordCount = slice.filter(t => STOPWORDS.has(t)).length;
    if (n === 2 && stopwordCount > 0) continue; // Bigrams: no stopwords
    if (n >= 3 && stopwordCount > 1) continue;  // Longer: max 1 stopword
    
    // Skip if too many generic terms
    const genericCount = slice.filter(t => GENERIC_TERMS.has(t)).length;
    if (n === 2 && genericCount > 1) continue; // Bigrams: max 1 generic
    if (n >= 3 && genericCount > 2) continue;  // Longer: max 2 generic
    
    // Each token must be meaningful length
    if (slice.some(t => t.length < 3)) continue;
    
    // Require at least one substantial word (5+ chars)
    if (!slice.some(t => t.length >= 5 && !GENERIC_TERMS.has(t))) continue;
    
    out.push(phrase);
  }
  return out;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "GET, POST, OPTIONS");

  if (req.method === 'OPTIONS') {
    // Reply to preflight with explicit allowed methods and credentials
    return new Response(null, { status: 204, headers: corsHeaders });
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
    console.log(`Authenticated user: ${userId}`);

    // Validate request body with Zod schema
    const requestBody = await req.json();
    const validationResult = safeValidateRequest(extractPostKeywordsSchema, requestBody);
    
    if (!validationResult.success) {
      return createValidationErrorResponse(validationResult, corsHeaders);
    }

    const { blog_post_id, article_id, content: overrideContent, title: overrideTitle } = validationResult.data;

    console.log('extract-post-keywords called with:', { 
      blog_post_id, 
      article_id, 
      hasContent: !!overrideContent, 
      hasTitle: !!overrideTitle,
      userId
    });

    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    }

    // Use service role for database operations (after authentication)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch post by id or use provided content
    let title = overrideTitle || '';
    let content = overrideContent || '';
    let postRecord: any = null;

    if (blog_post_id) {
      console.log('Fetching blog_post:', blog_post_id);
      // CRITICAL SECURITY: Verify user owns the blog post through blog ownership
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, content, excerpt, blogs!inner(user_id)')
        .eq('id', blog_post_id)
        .eq('blogs.user_id', userId)  // CRITICAL: Verify ownership
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Post not found or unauthorized" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      postRecord = data;
      title = title || (data?.title || '');
      
      // Handle content extraction
      let extractedContent = '';
      if (data?.content) {
        if (typeof data.content === 'string') {
          extractedContent = data.content;
        } else if (typeof data.content === 'object') {
          extractedContent = data.content.content || data.content.main_content || data.content.body || JSON.stringify(data.content);
        }
      }
      content = content || extractedContent || data?.excerpt || '';
      
      console.log('Blog post extracted - title:', !!title, 'content length:', content.length);
    }

    if (article_id && !postRecord) {
      console.log('Fetching article:', article_id);
      // CRITICAL SECURITY: Verify user owns the article
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, content, user_id')
        .eq('id', article_id)
        .eq('user_id', userId)  // CRITICAL: Verify ownership
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Article not found or unauthorized" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      postRecord = data;
      title = title || (data?.title || '');
      
      // Handle articles content extraction
      let artContent = '';
      if (data?.content) {
        if (typeof data.content === 'string') {
          artContent = data.content;
        } else if (typeof data.content === 'object') {
          artContent = data.content.content || data.content.main_content || JSON.stringify(data.content);
        }
      }
      content = content || artContent || '';
      
      console.log('Article extracted - title:', !!title, 'content length:', content.length);
    }

    if (!content && !title) {
      console.error('No content or title found:', { blog_post_id, article_id });
      return new Response(JSON.stringify({ error: 'No content or title provided' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build text to extract from
    const normalizedContent = normalizeText((title + ' ' + content).slice(0, 20000));
    const tokens = normalizedContent.split(' ').filter(Boolean).filter(t => !STOPWORDS.has(t) && t.length > 2);

    // Extract multi-word phrases with different weights
    const freq: Record<string, number> = {};
    
    // Bigrams (2-word phrases) - HIGHEST priority for SEO
    const bigrams = getNgrams(tokens, 2);
    for (const bg of bigrams) {
      freq[bg] = (freq[bg] || 0) + 10; // Very high weight for quality bigrams
    }
    
    // Trigrams (3-word phrases) - Excellent for long-tail
    const trigrams = getNgrams(tokens, 3);
    for (const tg of trigrams) {
      freq[tg] = (freq[tg] || 0) + 15; // Even higher weight for trigrams
    }
    
    // 4-grams (4-word phrases) - Very specific
    const fourgrams = getNgrams(tokens, 4);
    for (const fg of fourgrams) {
      freq[fg] = (freq[fg] || 0) + 20; // Highest weight for 4-grams
    }

    // Strategic placement boosts
    const normalizedTitle = normalizeText(title);
    const titleTokens = new Set(normalizedTitle.split(' ').filter(Boolean));
    
    for (const [keyword, score] of Object.entries(freq)) {
      // Boost if keyword appears in title
      if (normalizedTitle.includes(keyword)) {
        freq[keyword] = score * 5; // 5x boost for title match
      } else if (keyword.split(' ').some(t => titleTokens.has(t))) {
        freq[keyword] = score * 2; // 2x boost for partial title match
      }
    }

    // Create array and sort by score
    const items = Object.entries(freq).map(([keyword, count]) => ({ 
      keyword, 
      score: count,
      wordCount: keyword.split(' ').length
    }));
    
    // Sort by score, then by word count (prefer longer phrases)
    items.sort((a, b) => {
      if (Math.abs(a.score - b.score) < 5) {
        return b.wordCount - a.wordCount; // If scores similar, prefer more words
      }
      return b.score - a.score;
    });

    // Keep top 15 and normalize scores
    const top = items.slice(0, 15);
    const maxScore = top[0]?.score || 1;
    const extracted = top.map((it) => ({ 
      keyword: it.keyword, 
      score: Math.round((it.score / maxScore) * 100) / 100, 
      source: normalizedTitle.includes(it.keyword) ? 'title' : 'body' 
    }));

    console.log('Extracted keywords:', extracted.map(k => k.keyword));

    // Generate recommended topics with varied, natural titles
    const topicTemplates = [
      (kw: string) => `How to Master ${kw.charAt(0).toUpperCase() + kw.slice(1)}`,
      (kw: string) => `Understanding ${kw.charAt(0).toUpperCase() + kw.slice(1)}`,
      (kw: string) => `${kw.charAt(0).toUpperCase() + kw.slice(1)}: Best Practices`,
      (kw: string) => `Complete Guide to ${kw.charAt(0).toUpperCase() + kw.slice(1)}`,
      (kw: string) => `${kw.charAt(0).toUpperCase() + kw.slice(1)} Strategies That Work`,
      (kw: string) => `Getting Started with ${kw.charAt(0).toUpperCase() + kw.slice(1)}`,
      (kw: string) => `${kw.charAt(0).toUpperCase() + kw.slice(1)}: Tips and Techniques`,
      (kw: string) => `The Ultimate ${kw.charAt(0).toUpperCase() + kw.slice(1)} Resource`,
      (kw: string) => `Essential ${kw.charAt(0).toUpperCase() + kw.slice(1)} Knowledge`,
      (kw: string) => `${kw.charAt(0).toUpperCase() + kw.slice(1)} Made Simple`
    ];
    
    const recommended = extracted.slice(0, 6).map((k: any, i: number) => ({
      topic: topicTemplates[i % topicTemplates.length](k.keyword),
      score: k.score * (1 - i * 0.05),
      reason: `High relevance - ${k.source === 'title' ? 'appears in title' : 'found in content'}`
    }));

    // Attempt to enrich scores using DataForSEO keywords difficulty if present
    try {
      const keywordNames = top.map((t) => t.keyword);
      if (keywordNames.length > 0) {
        const { data: kwData } = await supabase
          .from('keywords')
          .select('keyword,difficulty')
          .in('keyword', keywordNames);

        const diffMap: Record<string, number | null> = {};
        for (const k of kwData || []) {
          diffMap[k.keyword.toLowerCase()] = k.difficulty ?? null;
        }

        // Adjust extracted scores: lower difficulty -> slightly higher score
        for (const ex of extracted) {
          const d = diffMap[ex.keyword.toLowerCase()];
          if (d !== null && d !== undefined) {
            const boost = 1 + (1 - Math.min(100, d) / 100) * 0.15; // up to +15%
            ex.score = Math.round(ex.score * boost * 100) / 100;
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch keyword difficulties for enrichment:', err);
    }

    // Update blog_posts if we have an id
    if (postRecord?.id) {
      const { error: updateError } = await supabase
        .from('blog_posts')
        .update({ extracted_keywords: extracted, recommended_topics: recommended })
        .eq('id', postRecord.id);

      if (updateError) {
        console.error('Failed to update blog_posts with keywords:', updateError);
      }
    }

    // If caller provided an article_id, update articles table as well
    if (article_id) {
      try {
        const { error: artErr } = await supabase
          .from('articles')
          .update({ extracted_keywords: extracted, recommended_topics: recommended })
          .eq('id', article_id);
        if (artErr) console.error('Failed to update articles with keywords:', artErr);
      } catch (err) {
        console.error('Error updating articles table:', err);
      }
    }

    return new Response(JSON.stringify({ success: true, extracted, recommended }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error in extract-post-keywords function:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
