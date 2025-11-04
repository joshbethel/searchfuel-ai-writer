
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

// Small stopword list for English. Expand as needed.
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
  if (req.method === 'OPTIONS') {
    // Reply to preflight with explicit allowed methods and credentials
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { blog_post_id, content: overrideContent, title: overrideTitle } = body;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch post by id or use provided content
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

    if (!content && !title) {
      return new Response(JSON.stringify({ error: 'No content or title provided' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build text to extract from (title weighted more later)
    const normalizedContent = normalizeText((title + ' ' + content).slice(0, 20000));
    const tokens = normalizedContent.split(' ').filter(Boolean).filter(t => !STOPWORDS.has(t) && t.length > 1);

    // Count unigrams and bigrams
    const freq: Record<string, number> = {};

    for (const unigram of tokens) {
      freq[unigram] = (freq[unigram] || 0) + 1;
    }

    const bigrams = getNgrams(tokens, 2);
    for (const bigram of bigrams) {
      freq[bigram] = (freq[bigram] || 0) + 2; // give bigrams slightly more weight
    }

    // Boost tokens that appear in the title
    const normalizedTitle = normalizeText(title);
    const titleTokens = new Set(normalizedTitle.split(' ').filter(Boolean));
    for (const t of titleTokens) {
      if (freq[t]) freq[t] = freq[t] * 1.5;
    }

  // Create array and sort by score
  const items = Object.entries(freq).map(([keyword, count]) => ({ keyword, score: count }));
    items.sort((a, b) => b.score - a.score);

    // Keep top 15 and normalize scores to 0-1
    const top = items.slice(0, 15);
    const maxScore = top[0]?.score || 1;
    const extracted = top.map((it) => ({ keyword: it.keyword, score: Math.round((it.score / maxScore) * 100) / 100, source: titleTokens.has(it.keyword) ? 'title' : 'body' }));

    // Generate simple recommended topics (templates)
    const recommended = extracted.slice(0, 6).map((k: any, i: number) => ({
      topic: `${k.keyword.charAt(0).toUpperCase() + k.keyword.slice(1)}: A Practical Guide`,
      score: k.score * (1 - i * 0.05),
      reason: `High relevance based on post content and title`
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
    const { article_id } = body;
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
