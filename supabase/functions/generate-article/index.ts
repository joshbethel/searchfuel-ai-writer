
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, keyword, intent, websiteUrl } = await req.json();
    
    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Create Supabase client and pass auth via request headers
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Get user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Generating article for:', title);

    const systemPrompt = `You are an expert SEO content writer. Create a full, SEO-optimized blog article with:

1. Proper HTML formatting with H1, H2, H3 tags
2. Natural keyword placement throughout
3. Optimized for readability and search engines
4. Include meta description (under 160 characters)
5. Suggest 2-3 internal links (linking to relevant pages on the same domain)
6. Suggest 2-3 external backlinks (to authoritative sources with reasons)
7. Create a short social media caption

Return a JSON object with this structure:
{
  "title": "SEO-optimized title tag",
  "metaDescription": "Compelling meta description under 160 chars",
  "content": "Full article with HTML formatting (H1, H2, H3, p tags)",
  "keyword": "primary keyword",
  "internalLinks": [
    {
      "anchorText": "text to link",
      "targetUrl": "suggested internal page URL"
    }
  ],
  "externalLinks": [
    {
      "anchorText": "text to link",
      "targetUrl": "authoritative external URL",
      "reason": "why this link adds value"
    }
  ],
  "socialCaption": "short promotional snippet for social media"
}

Return ONLY valid JSON. No markdown, no explanation.`;

    const userPrompt = `Write a comprehensive, SEO-optimized article for:

Title: ${title}
Primary Keyword: ${keyword}
Search Intent: ${intent}
Website: ${websiteUrl}

The article should be 800-1200 words, engaging, and optimized for both users and search engines. Include strategic internal and external links.`;

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
      throw new Error('Failed to generate article');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse the JSON response
    let article;
    try {
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      article = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Invalid response format from AI');
    }

    console.log('Successfully generated article');

    // Save article to database
    const { data: savedArticle, error: saveError } = await supabaseClient
      .from('articles')
      .insert({
        user_id: user.id,
        title: article.title,
        keyword: article.keyword,
        intent,
        content: article,
        website_url: websiteUrl,
        status: 'published'
      })
      .select()
      .single();

    if (saveError) {
      console.error('Failed to save article:', saveError);
      throw new Error('Failed to save article');
    }

    // Best-effort: trigger extract-post-keywords to annotate the saved article
    try {
      await supabaseClient.functions.invoke('extract-post-keywords', {
        body: { article_id: savedArticle.id, title: article.title, content: article.content }
      });
    } catch (err) {
      console.error('Failed to invoke extract-post-keywords for article:', err);
    }

    return new Response(
      JSON.stringify({ article, id: savedArticle.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-article function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
