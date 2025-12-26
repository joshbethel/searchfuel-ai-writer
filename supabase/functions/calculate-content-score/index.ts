import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { 
  safeValidateRequest, 
  createValidationErrorResponse,
  calculateContentScoreSchema
} from "../_shared/validation.ts";

interface ContentScoreFactors {
  word_count_score: number;
  heading_structure_score: number;
  keyword_optimization_score: number;
  readability_score: number;
  competitor_comparison: number;
  overall_score: number;
}

function calculateWordCountScore(actual: number, recommended: number): number {
  if (actual >= recommended) return 100;
  if (actual >= recommended * 0.9) return 90;
  if (actual >= recommended * 0.8) return 80;
  if (actual >= recommended * 0.7) return 70;
  if (actual >= recommended * 0.6) return 60;
  return Math.max(0, (actual / recommended) * 100);
}

function calculateHeadingScore(content: string): number {
  const h2Matches = (content.match(/<h2[^>]*>/gi) || []).length;
  const h3Matches = (content.match(/<h3[^>]*>/gi) || []).length;
  
  // Good structure: 3-8 H2s, some H3s
  let score = 100;
  if (h2Matches < 3) score -= 20;
  if (h2Matches > 10) score -= 10;
  if (h3Matches === 0 && h2Matches > 5) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

function calculateKeywordOptimizationScore(content: string, title: string, keyword: string): number {
  if (!keyword) return 50; // Default score if no keyword
  
  let score = 0;
  const lowerContent = content.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  
  // Keyword in title (20 points)
  if (lowerTitle.includes(lowerKeyword)) score += 20;
  
  // Keyword in first paragraph (20 points)
  const firstParagraph = content.substring(0, 500).toLowerCase();
  if (firstParagraph.includes(lowerKeyword)) score += 20;
  
  // Keyword in headings (30 points)
  const headingMatches = (content.match(/<h[2-3][^>]*>.*?<\/h[2-3]>/gi) || [])
    .filter(h => h.toLowerCase().includes(lowerKeyword)).length;
  if (headingMatches > 0) score += 30;
  
  // Keyword density 1-3% (30 points)
  const wordCount = content.split(/\s+/).length;
  const keywordCount = (lowerContent.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  const density = wordCount > 0 ? (keywordCount / wordCount) * 100 : 0;
  if (density >= 1 && density <= 3) score += 30;
  else if (density > 0.5 && density < 1) score += 15;
  else if (density > 3 && density < 5) score += 15;
  
  return Math.min(100, score);
}

function calculateReadabilityScore(content: string): number {
  // Simplified readability - in production, use Flesch Reading Ease
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = content.split(/\s+/).filter(w => w.length > 0);
  
  if (sentences.length === 0 || words.length === 0) return 50;
  
  const avgSentenceLength = words.length / sentences.length;
  const avgWordLength = words.join('').length / words.length;
  
  let score = 100;
  // Ideal sentence length: 15-20 words
  if (avgSentenceLength < 10) score -= 20;
  if (avgSentenceLength > 25) score -= 20;
  // Ideal word length: 4-5 characters
  if (avgWordLength > 6) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

function calculateCompetitorComparison(
  wordCount: number,
  competitorAnalysis: any
): number {
  if (!competitorAnalysis?.insights) return 50;
  
  const { avg_word_count, recommended_word_count } = competitorAnalysis.insights;
  
  if (wordCount >= recommended_word_count) return 100;
  if (wordCount >= avg_word_count) return 85;
  if (wordCount >= avg_word_count * 0.9) return 75;
  if (wordCount >= avg_word_count * 0.8) return 65;
  return Math.max(0, (wordCount / avg_word_count) * 100);
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
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

    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate request body
    const requestBody = await req.json();
    const validationResult = safeValidateRequest(calculateContentScoreSchema, requestBody);
    
    if (!validationResult.success) {
      return createValidationErrorResponse(validationResult, corsHeaders);
    }

    const { postId } = validationResult.data;

    // Get post with competitor analysis
    const { data: post, error: postError } = await supabase
      .from("blog_posts")
      .select(`
        id, 
        title, 
        content, 
        competitor_analysis, 
        blogs!inner(user_id)
      `)
      .eq("id", postId)
      .eq("blogs.user_id", authData.user.id)
      .single();

    if (postError || !post) {
      return new Response(
        JSON.stringify({ error: "Post not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const competitorAnalysis = post.competitor_analysis as any;
    const content = post.content || '';
    const title = post.title || '';
    
    // Extract keyword from competitor analysis or use first extracted keyword
    const keyword = competitorAnalysis?.keyword || '';

    // Calculate scores
    const wordCount = content.split(/\s+/).length;
    const recommendedWordCount = competitorAnalysis?.insights?.recommended_word_count || 2000;
    
    const wordCountScore = calculateWordCountScore(wordCount, recommendedWordCount);
    const headingScore = calculateHeadingScore(content);
    const keywordScore = calculateKeywordOptimizationScore(content, title, keyword);
    const readabilityScore = calculateReadabilityScore(content);
    const competitorScore = calculateCompetitorComparison(wordCount, competitorAnalysis);

    // Weighted average
    const overallScore = Math.round(
      wordCountScore * 0.3 +
      headingScore * 0.2 +
      keywordScore * 0.2 +
      readabilityScore * 0.15 +
      competitorScore * 0.15
    );

    const factors: ContentScoreFactors = {
      word_count_score: Math.round(wordCountScore),
      heading_structure_score: Math.round(headingScore),
      keyword_optimization_score: Math.round(keywordScore),
      readability_score: Math.round(readabilityScore),
      competitor_comparison: Math.round(competitorScore),
      overall_score: overallScore
    };

    // Update post with score
    await supabase
      .from("blog_posts")
      .update({
        content_score: overallScore,
        content_score_factors: factors
      })
      .eq("id", postId);

    return new Response(
      JSON.stringify({ score: overallScore, factors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in calculate-content-score:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

