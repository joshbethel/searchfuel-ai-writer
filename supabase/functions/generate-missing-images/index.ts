import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('Fetching ALL blog posts to regenerate images...');

    // Get ALL posts to regenerate images with new viral thumbnail style
    const { data: posts, error: fetchError } = await supabase
      .from('blog_posts')
      .select('id, title, blog_id, blogs(industry)');

    if (fetchError) {
      console.error('Error fetching posts:', fetchError);
      throw fetchError;
    }

    if (!posts || posts.length === 0) {
      console.log('No posts found');
      return new Response(
        JSON.stringify({ message: 'No posts found', updated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${posts.length} posts. Regenerating ALL images with viral thumbnail style...`);

    const results = [];

    for (const post of posts) {
      try {
        console.log(`Generating viral thumbnail image for: ${post.title}`);

        const industry = (post.blogs as any)?.industry || 'business';
        
        // Extract core topic from title (remove common prefixes)
        const cleanTopic = post.title
          .replace(/^\d+\s+(Benefits|Ways|Tips|Reasons|Steps)/i, '')
          .replace(/^(How to|Why|What is|When to)/i, '')
          .trim();

        const imagePrompt = `Create a clean, professional thumbnail for: ${cleanTopic}.
Style: Simple viral thumbnail with SINGLE focal point, minimal elements, clean composition.
CRITICAL RULES:
- NO TEXT, NO WORDS, NO LETTERS whatsoever
- ONE clear subject/object only - not busy
- Simple background - solid color or subtle gradient
- Professional photography quality
- Clean, uncluttered composition
Industry context: ${industry}
Format: 16:9 aspect ratio, centered single subject.`;

        const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image-preview",
            messages: [
              {
                role: "user",
                content: imagePrompt
              }
            ],
            modalities: ["image", "text"]
          }),
        });

        if (!imageResponse.ok) {
          console.error(`Image generation failed for "${post.title}" with status: ${imageResponse.status}`);
          results.push({ postId: post.id, title: post.title, success: false, error: 'API request failed' });
          continue;
        }

        const imageData = await imageResponse.json();
        const featuredImage = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (!featuredImage) {
          console.error(`No image data returned for "${post.title}"`);
          results.push({ postId: post.id, title: post.title, success: false, error: 'No image in response' });
          continue;
        }

        // Update the post with the generated image
        const { error: updateError } = await supabase
          .from('blog_posts')
          .update({ featured_image: featuredImage })
          .eq('id', post.id);

        if (updateError) {
          console.error(`Error updating post "${post.title}":`, updateError);
          results.push({ postId: post.id, title: post.title, success: false, error: updateError.message });
        } else {
          console.log(`Successfully generated and saved image for: ${post.title}`);
          results.push({ postId: post.id, title: post.title, success: true });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error processing post "${post.title}":`, error);
        results.push({ 
          postId: post.id, 
          title: post.title, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Image generation complete. ${successCount}/${posts.length} successful.`);

    return new Response(
      JSON.stringify({ 
        message: 'Image generation complete',
        total: posts.length,
        successful: successCount,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-missing-images function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
