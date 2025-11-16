
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getCorsHeaders } from "../_shared/cors.ts";
import { 
  generateArticleSchema, 
  safeValidateRequest, 
  createValidationErrorResponse 
} from "../_shared/validation.ts";
import {
  createErrorResponse,
  handleApiError,
  safeGet,
  validateRequiredFields,
  safeJsonParse
} from "../_shared/error-handling.ts";

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // CRITICAL SECURITY: Authenticate user first
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return createErrorResponse(
        new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY'),
        500,
        corsHeaders,
        'Server configuration error. Please contact support.'
      );
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
    console.log(`Authenticated user: ${userId} - Generating article`);

    // Validate request body with Zod schema
    const requestBody = await req.json();
    const validationResult = safeValidateRequest(generateArticleSchema, requestBody);
    
    if (!validationResult.success) {
      return createValidationErrorResponse(validationResult, corsHeaders);
    }

    const { title, keyword, intent, websiteUrl } = validationResult.data;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      return createErrorResponse(
        new Error('LOVABLE_API_KEY is not configured'),
        500,
        corsHeaders,
        'AI service is not available. Please contact support.'
      );
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
      return handleApiError(response, corsHeaders, 'Article generation');
    }

    // Safely parse response with null checks
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('Failed to parse AI gateway response as JSON:', jsonError);
      return createErrorResponse(
        jsonError,
        500,
        corsHeaders,
        'Invalid response from AI service. Please try again.'
      );
    }

    // Validate response structure with null checks
    const content = safeGet(data, 'choices.0.message.content', null);
    if (!content || typeof content !== 'string') {
      console.error('Invalid AI response structure:', JSON.stringify(data, null, 2));
      return createErrorResponse(
        new Error('Invalid AI response structure'),
        500,
        corsHeaders,
        'AI service returned an invalid response. Please try again.'
      );
    }
    
    // Parse the JSON response from content
    let article;
    try {
      const contentStr = content as string;
      const cleanContent = contentStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      article = JSON.parse(cleanContent);
    } catch (parseError) {
      const contentStr = content as string;
      console.error('Failed to parse AI response JSON:', {
        error: parseError,
        contentPreview: contentStr.substring(0, 200),
        contentLength: contentStr.length
      });
      return createErrorResponse(
        parseError,
        500,
        corsHeaders,
        'AI service returned invalid data format. Please try again.'
      );
    }

    // Validate required article fields
    const validation = validateRequiredFields(article, ['title', 'content', 'keyword']);
    if (!validation.valid) {
      console.error('Article missing required fields:', validation.missing);
      return createErrorResponse(
        new Error(`Article missing required fields: ${validation.missing.join(', ')}`),
        500,
        corsHeaders,
        'AI service returned incomplete article. Please try again.'
      );
    }

    console.log('Successfully generated article');

    // Save article to database
    const { data: savedArticle, error: saveError } = await supabaseClient
      .from('articles')
      .insert({
        user_id: userId,
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
      
      // Check for specific database errors
      if (saveError.code === '23505') { // Unique constraint violation
        return createErrorResponse(
          saveError,
          409,
          corsHeaders,
          'An article with this title already exists.'
        );
      }
      
      return createErrorResponse(
        saveError,
        500,
        corsHeaders,
        'Failed to save article. Please try again.'
      );
    }

    // Validate saved article was returned
    if (!savedArticle || !savedArticle.id) {
      console.error('Article saved but no ID returned:', savedArticle);
      return createErrorResponse(
        new Error('Article saved but ID not returned'),
        500,
        corsHeaders,
        'Article was created but could not be retrieved. Please try again.'
      );
    }

    // Best-effort: trigger extract-post-keywords to annotate the saved article
    // This is non-critical, so we don't fail if it errors
    try {
      // Validate content exists before invoking
      const articleContent = safeGet(article, 'content', '');
      if (articleContent) {
        await supabaseClient.functions.invoke('extract-post-keywords', {
          body: { 
            article_id: savedArticle.id, 
            title: article.title, 
            content: articleContent 
          }
        });
      } else {
        console.warn('Skipping extract-post-keywords: article content is empty');
      }
    } catch (err) {
      // Log but don't fail - this is a best-effort operation
      console.error('Failed to invoke extract-post-keywords for article:', err);
      // Continue - article is already saved successfully
    }

    return new Response(
      JSON.stringify({ article, id: savedArticle.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    // Catch-all for any unexpected errors
    console.error('Unexpected error in generate-article function:', error);
    return createErrorResponse(
      error,
      500,
      corsHeaders,
      'An unexpected error occurred. Please try again.'
    );
  }
});
