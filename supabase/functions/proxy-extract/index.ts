
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
    out.push(tokens.slice(i, i + n).join(' '));
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
    const tokens = normalizedContent.split(' ').filter(Boolean).filter(t => !STOPWORDS.has(t) && t.length > 1);

    const freq: Record<string, number> = {};
    for (const unigram of tokens) {
      freq[unigram] = (freq[unigram] || 0) + 1;
    }

    const bigrams = getNgrams(tokens, 2);
    for (const bigram of bigrams) {
      freq[bigram] = (freq[bigram] || 0) + 2;
    }

    const normalizedTitle = normalizeText(title);
    const titleTokens = new Set(normalizedTitle.split(' ').filter(Boolean));
    for (const t of titleTokens) {
      if (freq[t]) freq[t] = freq[t] * 1.5;
    }

    const items = Object.entries(freq).map(([keyword, count]) => ({ keyword, score: count }));
    items.sort((a, b) => b.score - a.score);

    const top = items.slice(0, 15);
    const maxScore = top[0]?.score || 1;
    const extracted = top.map((it) => ({ keyword: it.keyword, score: Math.round((it.score / maxScore) * 100) / 100, source: titleTokens.has(it.keyword) ? 'title' : 'body' }));

    const recommended = extracted.slice(0, 6).map((k: any, i: number) => ({
      topic: `${k.keyword.charAt(0).toUpperCase() + k.keyword.slice(1)}: A Practical Guide`,
      score: k.score * (1 - i * 0.05),
      reason: `High relevance based on post content and title`
    }));

    // Try to enrich using keywords table
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

        for (const ex of extracted) {
          const d = diffMap[ex.keyword.toLowerCase()];
          if (d !== null && d !== undefined) {
            const boost = 1 + (1 - Math.min(100, d) / 100) * 0.15;
            ex.score = Math.round(ex.score * boost * 100) / 100;
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch keyword difficulties for enrichment:', err);
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
