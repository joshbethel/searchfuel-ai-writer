import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { 
  analyzeWebsiteSchema, 
  safeValidateRequest, 
  createValidationErrorResponse 
} from "../_shared/validation.ts";

// Extract business information from HTML
function extractBusinessInfo(html: string, url: string): {
  company_name: string;
  company_description: string;
  industry: string;
  language: string;
} {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  
  // Extract meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const description = descMatch ? descMatch[1].trim() : '';
  
  // Extract Open Graph title (often more accurate)
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : '';
  
  // Extract Open Graph description
  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const ogDesc = ogDescMatch ? ogDescMatch[1].trim() : '';
  
  // Extract language from HTML lang attribute
  const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);
  const htmlLang = langMatch ? langMatch[1].substring(0, 2).toLowerCase() : 'en';
  
  // Extract company name from title (remove common suffixes)
  let companyName = ogTitle || title;
  if (companyName) {
    // Remove common website suffixes
    companyName = companyName
      .replace(/\s*[-|]\s*(Home|Welcome|Official).*$/i, '')
      .replace(/\s*[-|]\s*.*$/i, '') // Remove everything after dash/pipe
      .trim();
    
    // If title is too long, take first part
    if (companyName.length > 50) {
      companyName = companyName.split(' ').slice(0, 5).join(' ');
    }
  } else {
    // Fallback: extract from domain
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace(/^www\./, '');
      companyName = hostname.split('.')[0];
      companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1);
    } catch {
      companyName = 'Company';
    }
  }
  
  // Use best available description
  const companyDescription = ogDesc || description || '';
  
  // Try to detect industry from content (basic keywords)
  let industry = '';
  const industryKeywords: Record<string, string[]> = {
    'SaaS': ['saas', 'software', 'platform', 'app', 'tool', 'dashboard'],
    'E-commerce': ['shop', 'store', 'buy', 'cart', 'product', 'ecommerce'],
    'Healthcare': ['health', 'medical', 'doctor', 'clinic', 'hospital', 'patient'],
    'Technology': ['tech', 'technology', 'digital', 'innovation', 'software'],
    'Marketing': ['marketing', 'advertising', 'brand', 'campaign', 'seo'],
    'Education': ['education', 'learn', 'course', 'training', 'school', 'university'],
    'Finance': ['finance', 'financial', 'bank', 'investment', 'money', 'accounting'],
    'Real Estate': ['real estate', 'property', 'home', 'house', 'realty'],
    'Legal': ['law', 'legal', 'attorney', 'lawyer', 'legal services'],
    'Consulting': ['consulting', 'consultant', 'advisory', 'strategy'],
  };
  
  const contentLower = (title + ' ' + description).toLowerCase();
  for (const [ind, keywords] of Object.entries(industryKeywords)) {
    if (keywords.some(keyword => contentLower.includes(keyword))) {
      industry = ind;
      break;
    }
  }
  
  return {
    company_name: companyName,
    company_description: companyDescription,
    industry: industry,
    language: htmlLang,
  };
}

// Generate basic competitors (can be enhanced with SERP data later)
function generateBasicCompetitors(url: string, industry: string): Array<{ domain: string; name?: string }> {
  const competitors: Array<{ domain: string; name?: string }> = [];
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    const domainParts = hostname.split('.');
    
    // For now, return empty array - will be enhanced with SERP data in future
    // This is a placeholder that can be expanded
    return competitors;
  } catch {
    return competitors;
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate request body with Zod schema
    const requestBody = await req.json();
    const validationResult = safeValidateRequest(analyzeWebsiteSchema, requestBody);
    
    if (!validationResult.success) {
      return createValidationErrorResponse(validationResult, corsHeaders);
    }

    const { url } = validationResult.data;
    
    // Basic URL security check
    try {
      const urlObj = new URL(url);
      // Block localhost and private IPs for security
      if (urlObj.hostname === 'localhost' || 
          urlObj.hostname === '127.0.0.1' ||
          urlObj.hostname.startsWith('192.168.') ||
          urlObj.hostname.startsWith('10.') ||
          urlObj.hostname.startsWith('172.')) {
        throw new Error('Private URLs are not allowed');
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid URL',
          details: error instanceof Error ? error.message : 'The provided URL is not valid'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Analyzing website:', url);

    // Fetch the website
    let html = '';
    try {
      const websiteResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SearchFuel/1.0; +https://searchfuel.app)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        // Timeout after 10 seconds
        signal: AbortSignal.timeout(10000),
      });
      
      if (websiteResponse.ok) {
        html = await websiteResponse.text();
        console.log('Successfully fetched website HTML');
      } else {
        throw new Error(`HTTP ${websiteResponse.status}: ${websiteResponse.statusText}`);
      }
    } catch (fetchError) {
      console.error('Error fetching website:', fetchError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch website',
          details: fetchError instanceof Error ? fetchError.message : 'Could not access the website. Please check the URL and try again.'
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Extract business information
    const businessInfo = extractBusinessInfo(html, url);
    
    // Generate competitors (basic for now, can be enhanced)
    const competitors = generateBasicCompetitors(url, businessInfo.industry);

    // Return structured response
    return new Response(
      JSON.stringify({
        success: true,
        businessInfo: {
          company_name: businessInfo.company_name,
          company_description: businessInfo.company_description,
          industry: businessInfo.industry,
          language: businessInfo.language,
        },
        competitors: competitors,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in analyze-website:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'An unexpected error occurred'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

