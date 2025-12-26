// @ts-nocheck
// This file uses Deno runtime, not Node.js - TypeScript errors are expected

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { 
  generateBlogPostSchema, 
  safeValidateRequest, 
  createValidationErrorResponse 
} from "../_shared/validation.ts";

const ARTICLE_TYPE_GUIDELINES: Record<string, string> = {
  listicle: `Format as a numbered list article with 7-15 items. Structure:
- Engaging introduction explaining the list's value
- Each list item should have:
  * Bold numbered heading (e.g., "1. Clear Benefit Title")
  * 2-3 paragraphs of detailed explanation
  * Specific examples or data points
  * Actionable takeaways
- Conclusion summarizing key points
Use subheadings for each list item.`,

  how_to: `Format as a comprehensive step-by-step tutorial. Structure:
- Introduction: Explain what readers will learn and why it matters
- Prerequisites section (if needed)
- Numbered steps (typically 5-12 steps):
  * Clear action-oriented step title
  * Detailed instructions with context
  * Tips, warnings, or best practices
  * Expected outcomes for each step
- Conclusion with next steps or additional resources
Include relevant screenshots or visual placeholders.`,

  checklist: `Format as an actionable checklist article. Structure:
- Introduction: Explain the checklist's purpose and impact
- Main checklist with 10-20 items organized in logical sections
- Each item should include:
  * Checkbox-style formatting (use • or ☐)
  * Clear, action-oriented item
  * Brief 1-2 sentence explanation of why it matters
- Optional: Priority indicators (High/Medium/Low)
- Conclusion: Emphasize completeness and benefits
Make items specific and immediately actionable.`,

  qa: `Format as a Q&A article addressing common questions. Structure:
- Introduction: Explain the topic and why these questions matter
- 8-15 Q&A pairs organized by theme/difficulty:
  * **Question:** Bold, clear question from user perspective
  * **Answer:** Comprehensive 2-4 paragraph answer with examples
  * Include data, expert insights, or real scenarios
- Optional: "Frequently Asked Questions" subsections
- Conclusion: Summary and encouragement to ask more
Write questions as real users would ask them.`,

  versus: `Format as a detailed comparison article. Structure:
- Introduction: Explain what's being compared and for whom
- Overview of each option (2-3 options):
  * Brief description
  * Key characteristics
  * Ideal use cases
- Side-by-side comparison table (if applicable)
- Detailed comparison across 5-7 criteria:
  * Clear criterion heading
  * How each option performs
  * Winner or trade-offs
- Final verdict/recommendation based on different scenarios
- Conclusion: Help readers make the right choice
Stay objective and fair to all options.`,

  roundup: `Format as a curated collection or roundup article. Structure:
- Introduction: Explain the topic and selection criteria
- 8-15 items/tactics/tools, each featuring:
  * Clear title/name
  * Brief description (2-3 sentences)
  * Why it made the list (key benefits)
  * Real example or use case
  * Link or resource (if applicable)
- Optional: Categorize items into subsections
- Conclusion: Encourage readers to try multiple items
Focus on high-value, actionable items with proven results.`,

  news: `Format as a news/update article. Structure:
- Headline-style introduction: What happened and why it matters
- Background: Context for readers unfamiliar with the topic
- Main news content:
  * Key facts and details
  * Official statements or data
  * Timeline of events (if relevant)
- Analysis: What this means for readers
  * Impact on industry/users
  * Expert perspectives
  * Predictions or implications
- Actionable takeaways: What readers should do now
Keep tone timely, factual, and authoritative.`,

  interactive_tool: `Format as an article featuring an interactive tool/calculator. Structure:
- Introduction: Explain the problem the tool solves
- How to use the tool:
  * Step-by-step instructions
  * Input descriptions
  * What outputs mean
- [Tool Placeholder]: Interactive element would go here
- Interpreting results:
  * What different outcomes mean
  * Actionable recommendations based on results
  * Examples of calculations
- Additional context: Related tips and best practices
- Conclusion: Encourage tool usage and next steps
Emphasize practical value and ease of use.`,

  advertorial: `Format as product-focused comparison/advertorial content. Structure:
- Introduction: Present the problem/need objectively
- Market overview: Briefly mention 2-3 competitive solutions
- Deep dive on your solution:
  * Key features and benefits
  * How it solves the problem uniquely
  * Real customer success stories
  * Pricing transparency
- Head-to-head comparison:
  * Clear comparison across 5-7 factors
  * Honest about trade-offs
  * Highlight unique advantages
- Conclusion: Clear CTA and next steps
Balance promotional content with genuine value and objectivity.`,
};

function getArticleTypeGuidelines(articleType: string): string {
  return ARTICLE_TYPE_GUIDELINES[articleType] || "";
}

function selectRandomArticleType(articleTypes: Record<string, boolean>): { type: string; name: string } {
  const enabledTypes = Object.entries(articleTypes)
    .filter(([_, enabled]) => enabled)
    .map(([type]) => type);

  if (enabledTypes.length === 0) {
    // Default to listicle if none enabled
    return { type: "listicle", name: "Listicle" };
  }

  const randomType = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
  
  const typeNames: Record<string, string> = {
    listicle: "Listicle",
    how_to: "How-to Guide",
    checklist: "Checklist",
    qa: "Q&A Article",
    versus: "Versus Comparison",
    roundup: "Roundup",
    news: "News Article",
    interactive_tool: "Interactive Tool",
    advertorial: "Advertorial",
  };

  return {
    type: randomType,
    name: typeNames[randomType] || randomType,
  };
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    // CRITICAL SECURITY FIX: Authenticate user first
    const supabaseClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
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

    // Use service role for database operations (after authentication)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get blog ID from request or find blogs that need posts
    // Validate request body with Zod schema
    const requestBody = await req.json().catch(() => ({}));
    const validationResult = safeValidateRequest(generateBlogPostSchema, requestBody);
    
    if (!validationResult.success) {
      return createValidationErrorResponse(validationResult, corsHeaders);
    }

    const { blogId, scheduledPublishDate } = validationResult.data;

    let blogsToProcess = [];

    if (blogId) {
      // CRITICAL SECURITY FIX: Verify blog ownership
      const { data, error } = await supabase
        .from("blogs")
        .select("*")
        .eq("id", blogId)
        .eq("user_id", userId) // Verify ownership
        .eq("onboarding_completed", true)
        .single();
      
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Blog not found or access denied" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      blogsToProcess = [data];
    } else {
      // Find all blogs for this user that need posts (auto-generation enabled)
      const { data } = await supabase
        .from("blogs")
        .select("*")
        .eq("user_id", userId) // Only user's blogs
        .eq("onboarding_completed", true)
        .eq("auto_post_enabled", true)
        .or(`last_post_generated_at.is.null,last_post_generated_at.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}`);
      
      blogsToProcess = data || [];
    }

    console.log(`Processing ${blogsToProcess.length} blogs`);

    const results = [];

    for (const blog of blogsToProcess) {
      try {
        // CRITICAL: Check usage limit before generating post
        const { data: canGenerate, error: limitError } = await supabase
          .rpc('can_generate_post', {
            user_uuid: userId,
            blog_uuid: blog.id
          });

        if (limitError || !canGenerate) {
          console.error(`Usage limit exceeded for user ${userId}, blog ${blog.id}`);
          // Return error immediately - don't generate anything
          return new Response(
            JSON.stringify({ 
              error: "You have reached your monthly post limit. Please upgrade your plan.",
              code: "LIMIT_EXCEEDED"
            }),
            { 
              status: 403, 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            }
          );
        }

        // Select article type based on blog preferences
        const articleTypes = blog.article_types || {
          listicle: true,
          how_to: true,
          checklist: true,
          qa: true,
          versus: true,
          roundup: true,
          news: true,
          interactive_tool: true,
          advertorial: true,
        };

        const selectedArticleType = selectRandomArticleType(articleTypes);
        console.log(`Selected article type for blog ${blog.id}: ${selectedArticleType.name}`);

        // Prepare backlink context
        const targetPages = blog.target_pages || [];
        const backlinkKeywords = targetPages
          .flatMap((page: any) => page.keywords || [])
          .join(", ");
        
        const backlinkContext = targetPages.length > 0
          ? `\n\nNatural Linking Opportunities:
- Naturally mention these topics where relevant: ${backlinkKeywords}
- Write flowing content where references to these topics feel organic
- Include these mentions 2-3 times throughout the post if contextually appropriate`
          : "";

        // Perform competitor analysis if keyword is available or use industry-based analysis
        let competitorInsights = '';
        let competitorAnalysis = null;
        const analysisKeyword = body.keyword || `${blog.industry || 'best practices'} ${blog.company_name || ''}`.trim();

        try {
          // Call competitor analysis function
          const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
          const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          
          if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
            const analysisResponse = await fetch(`${SUPABASE_URL}/functions/v1/analyze-competitor-content`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                keyword: analysisKeyword,
                blogId: blog.id
              })
            });

            if (analysisResponse.ok) {
              const analysisData = await analysisResponse.json();
              competitorAnalysis = analysisData.analysis;
              
              if (competitorAnalysis?.insights) {
                competitorInsights = `
Competitor Analysis Insights:
- Average word count of top-ranking pages: ${competitorAnalysis.insights.avg_word_count}
- Recommended word count: ${competitorAnalysis.insights.recommended_word_count}
- Common heading patterns: ${competitorAnalysis.insights.common_headings.slice(0, 3).join(', ')}
- Content gaps to address: ${competitorAnalysis.insights.content_gaps.join(', ') || 'None identified'}
- Search volume: ${competitorAnalysis.insights.volume || 'N/A'}
- Keyword difficulty: ${competitorAnalysis.insights.difficulty || 'N/A'}

Generate content that:
1. Matches or exceeds ${competitorAnalysis.insights.recommended_word_count} words
2. Uses similar heading structure to top-ranking pages
3. Addresses identified content gaps
4. Provides more comprehensive coverage than competitors
`;
              }
            }
          }
        } catch (error) {
          console.error("Error in competitor analysis:", error);
          // Continue without competitor insights
        }

        // Generate blog post using Lovable AI
        const systemPrompt = `You are an expert SEO content writer. Create a comprehensive, engaging blog post for ${blog.company_name}.

Company Details:
- Industry: ${blog.industry}
- Description: ${blog.company_description}
- Target Audience: ${blog.target_audience}
- Website: ${blog.website_homepage}
${blog.competitors?.length > 0 ? `- Competitors: ${blog.competitors.map((c: any) => c.name).join(", ")}` : ""}

Article Type: ${selectedArticleType.name}

${getArticleTypeGuidelines(selectedArticleType.type)}

${competitorInsights}

General Requirements:
- Write approximately ${competitorAnalysis?.insights?.recommended_word_count || 2000} words (aim for ${competitorAnalysis?.insights?.recommended_word_count ? Math.round(competitorAnalysis.insights.recommended_word_count * 0.9) : 1800}-${competitorAnalysis?.insights?.recommended_word_count || 2200})
- Include an engaging title optimized for SEO
- Write a compelling excerpt (150-200 characters)
- Use natural keyword integration
- Include actionable insights and examples
- Make it valuable for the target audience
- Use markdown formatting for structure
- IMPORTANT: Do NOT include the title as an H1 heading in the content - start directly with the introduction or first H2 section${backlinkContext}

Focus on topics related to their industry that would help their target audience. Follow the article type format strictly.`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: "Generate a blog post with title, excerpt, content, meta title, and meta description. Format as JSON with keys: title, excerpt, content, meta_title (50-60 characters for SEO), meta_description (150-160 characters for SEO)" },
            ],
          }),
        });

        if (!aiResponse.ok) {
          throw new Error(`AI API error: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        const generatedText = aiData.choices[0].message.content;

        // Try to parse JSON from the response
        let postData;
        try {
          // Remove markdown code blocks if present
          const cleanedText = generatedText.replace(/```json\n?|\n?```/g, '').trim();
          postData = JSON.parse(cleanedText);
        } catch {
          // If not JSON, extract manually
          const lines = generatedText.split("\n");
          postData = {
            title: lines.find((l: string) => l.includes("title"))?.split(":")[1]?.trim() || "New Blog Post",
            excerpt: lines.find((l: string) => l.includes("excerpt"))?.split(":")[1]?.trim() || "",
            content: generatedText,
          };
        }

        // Create slug from title
        const slug = postData.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        // Insert backlinks into content
        let processedContent = postData.content;
        let linksInserted = 0;
        const maxLinks = blog.max_links_per_post || 5;
        const insertedLinks: any[] = [];

        if (targetPages.length > 0 && blog.backlink_strategy !== 'disabled') {
          // Sort pages by priority
          const priorityOrder: any = { high: 3, medium: 2, low: 1 };
          const sortedPages = [...targetPages].sort(
            (a: any, b: any) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
          );

          for (const page of sortedPages) {
            if (linksInserted >= maxLinks) break;

            for (const keyword of page.keywords || []) {
              if (linksInserted >= maxLinks) break;

              // Find first occurrence of keyword that's not already linked
              const regex = new RegExp(`\\b${keyword}\\b(?![^\\[]*\\])`, 'i');
              const match = processedContent.match(regex);

              if (match) {
                const matchText = match[0];
                const link = `[${matchText}](${page.url})`;
                processedContent = processedContent.replace(regex, link);
                linksInserted++;
                insertedLinks.push({
                  keyword: matchText,
                  url: page.url,
                  priority: page.priority,
                });
                break; // Move to next page after inserting one link
              }
            }
          }
        }

        console.log(`Inserted ${linksInserted} backlinks into post: ${insertedLinks.map(l => l.keyword).join(", ")}`);

        // Generate featured image using Lovable AI
        let featuredImage = null;
        try {
          console.log(`Generating featured image for: ${postData.title}`);
          
          // Extract core topic from title (remove common prefixes)
          const cleanTopic = postData.title
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
Industry context: ${blog.industry || 'business'}
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

          if (imageResponse.ok) {
            const imageData = await imageResponse.json();
            featuredImage = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            console.log(`Successfully generated featured image for: ${postData.title}`);
          } else {
            console.error(`Image generation failed with status: ${imageResponse.status}`);
          }
        } catch (imageError) {
          console.error(`Error generating image for post "${postData.title}":`, imageError);
          // Continue without image - don't block article publishing
        }

        // Insert blog post with article type and featured image
        const { data: post, error: insertError } = await supabase
          .from("blog_posts")
          .insert({
            blog_id: blog.id,
            title: postData.title,
            slug,
            excerpt: postData.excerpt,
            content: processedContent,
            article_type: selectedArticleType.type,
            featured_image: featuredImage,
            status: scheduledPublishDate ? "draft" : "published",
            published_at: scheduledPublishDate ? null : new Date().toISOString(),
            scheduled_publish_date: scheduledPublishDate || null,
            publishing_status: scheduledPublishDate ? "scheduled" : "pending",
            meta_title: postData.meta_title || postData.title,
            meta_description: postData.meta_description || postData.excerpt,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Store competitor analysis and calculate content score
        if (competitorAnalysis) {
          await supabase
            .from("blog_posts")
            .update({
              competitor_analysis: competitorAnalysis,
              competitor_analysis_at: new Date().toISOString()
            })
            .eq("id", post.id);
        }

        // Calculate and store content score
        try {
          const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
          const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          
          if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
            const scoreResponse = await fetch(`${SUPABASE_URL}/functions/v1/calculate-content-score`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ postId: post.id })
            });
            
            if (scoreResponse.ok) {
              console.log("Content score calculated successfully");
            }
          }
        } catch (error) {
          console.error("Error calculating content score:", error);
          // Continue - score calculation is not critical
        }

        // Increment usage count after successful post creation
        console.log(`Incrementing post count for user ${userId}`);
        
        // Get subscription first
        const { data: subscription, error: subError } = await supabase
          .from('subscriptions')
          .select('id, posts_generated_count, status, plan_name')
          .eq('user_id', userId)
          .in('status', ['active', 'trialing'])
          .eq('plan_name', 'pro')
          .maybeSingle();
        
        if (subError) {
          console.error('Error fetching subscription:', subError);
        } else if (!subscription) {
          console.error('No active subscription found for user:', userId);
        } else {
          const currentCount = subscription.posts_generated_count || 0;
          const newCount = currentCount + 1;
          
          console.log('Subscription before increment:', {
            id: subscription.id,
            count: currentCount,
            status: subscription.status,
            plan: subscription.plan_name
          });
          
          // Direct UPDATE using service role (bypasses RLS)
          const { data: updateData, error: updateError } = await supabase
            .from('subscriptions')
            .update({ 
              posts_generated_count: newCount,
              updated_at: new Date().toISOString()
            })
            .eq('id', subscription.id)
            .select('posts_generated_count')
            .single();

          if (updateError) {
            console.error('Failed to increment usage count:', updateError);
          } else {
            console.log('Successfully incremented post count:', {
              subscription_id: subscription.id,
              old_count: currentCount,
              new_count: updateData?.posts_generated_count,
              expected: newCount
            });
            
            if (updateData?.posts_generated_count !== newCount) {
              console.error('WARNING: Post count mismatch after update!', {
                expected: newCount,
                actual: updateData?.posts_generated_count
              });
            }
          }
        }

        // Trigger keyword extraction for the newly created post (best-effort)
        try {
          await supabase.functions.invoke('extract-post-keywords', { body: { blog_post_id: post.id } });
        } catch (err) {
          console.error('Failed to invoke extract-post-keywords function:', err);
        }

        // Update blog's last_post_generated_at
        await supabase
          .from("blogs")
          .update({ last_post_generated_at: new Date().toISOString() })
          .eq("id", blog.id);

        // Insert analytics entry for today
        const today = new Date().toISOString().split("T")[0];
        await supabase
          .from("blog_analytics")
          .upsert({
            blog_id: blog.id,
            date: today,
            page_views: 0,
            unique_visitors: 0,
          }, { onConflict: "blog_id,date" });

        results.push({
          blogId: blog.id,
          postId: post.id,
          title: postData.title,
          articleType: selectedArticleType.name,
          backlinksInserted: linksInserted,
          links: insertedLinks,
          success: true,
        });

        console.log(`Generated ${selectedArticleType.name} post for blog ${blog.id}: ${postData.title}`);

        // Check if we should schedule or publish immediately
        if (scheduledPublishDate) {
          // Already set as scheduled in the insert above
          console.log(`Post scheduled for ${scheduledPublishDate}`);
        } else if (blog.cms_platform === 'framer') {
          // Framer posts stay pending for manual publishing
          console.log(`✓ Article created for Framer. Status: PENDING for manual publishing.`);
          console.log(`  - Post ID: ${post.id}`);
          console.log(`  - Title: ${postData.title}`);
          console.log(`  - Publishing Status: pending`);
          // Article stays as "pending" - no auto-publish to Framer
        } else if (blog.cms_platform && blog.cms_credentials) {
          // Auto-publish to other CMS platforms (WordPress, Shopify, Wix, etc.)
          console.log(`Auto-publishing to ${blog.cms_platform}...`);
          
          // Wix needs longer delay due to API latency
          const initialDelay = blog.cms_platform === 'wix' ? 2500 : 1500;
          console.log(`Waiting ${initialDelay}ms before publishing (${blog.cms_platform})...`);
          await new Promise(resolve => setTimeout(resolve, initialDelay));
          
          // Verify post exists before publishing
          const { data: postCheck, error: postCheckErr } = await supabase
            .from('blog_posts')
            .select('id, title, content, featured_image')
            .eq('id', post.id)
            .single();
          
          if (postCheckErr || !postCheck) {
            console.error('Post not found for publishing:', postCheckErr);
          } else {
            console.log(`Post verified: ${postCheck.title}, has image: ${!!postCheck.featured_image}`);
            
            // Update status to publishing
            await supabase
              .from('blog_posts')
              .update({ publishing_status: 'publishing' })
              .eq('id', post.id);
            
            // Retry logic for Wix (race condition on first attempt)
            const maxRetries = blog.cms_platform === 'wix' ? 3 : 1;
            let lastError: any = null;
            let publishSuccess = false;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              try {
                console.log(`Publish attempt ${attempt}/${maxRetries} for ${blog.cms_platform}...`);
                
                // Invoke publish function with service role auth for function-to-function call
                const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
                const { data: publishResult, error: publishError } = await supabase.functions.invoke(
                  'publish-to-cms',
                  { 
                    body: { blog_post_id: post.id },
                    headers: {
                      Authorization: `Bearer ${serviceRoleKey}`
                    }
                  }
                );
                
                if (publishError) {
                  lastError = publishError;
                  console.error(`Publish attempt ${attempt} failed:`, publishError);
                } else if (publishResult?.success) {
                  console.log(`Successfully published to ${blog.cms_platform} on attempt ${attempt}`);
                  publishSuccess = true;
                  break;
                } else {
                  lastError = publishResult?.error || 'Unknown publish error';
                  console.error(`Publish attempt ${attempt} returned failure:`, publishResult);
                }
                
                // Wait before retry (exponential backoff)
                if (attempt < maxRetries) {
                  const retryDelay = 2000 * attempt;
                  console.log(`Waiting ${retryDelay}ms before retry...`);
                  await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
              } catch (publishErr) {
                lastError = publishErr;
                console.error(`Publish attempt ${attempt} threw error:`, publishErr);
                
                if (attempt < maxRetries) {
                  const retryDelay = 2000 * attempt;
                  console.log(`Waiting ${retryDelay}ms before retry...`);
                  await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
              }
            }
            
            // Update final status
            if (!publishSuccess) {
              console.error('All publish attempts failed. Last error:', lastError);
              await supabase
                .from('blog_posts')
                .update({ publishing_status: 'failed' })
                .eq('id', post.id);
            }
          }
        } else {
          // No CMS connected - article stays pending
          console.log(`Article created without CMS connection. Status: pending`);
        }
      } catch (error) {
        console.error(`Error generating post for blog ${blog.id}:`, error);
        results.push({
          blogId: blog.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: blogsToProcess.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in generate-blog-post function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
