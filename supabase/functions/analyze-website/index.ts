import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { 
  analyzeWebsiteSchema, 
  safeValidateRequest, 
  createValidationErrorResponse 
} from "../_shared/validation.ts";

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const DATAFORSEO_LOGIN = Deno.env.get('DATAFORSEO_LOGIN');
const DATAFORSEO_PASSWORD = Deno.env.get('DATAFORSEO_PASSWORD');

// Extract structured data (JSON-LD, Schema.org) from HTML
function extractStructuredData(html: string): {
  organization?: Record<string, unknown>;
  business?: Record<string, unknown>;
  website?: Record<string, unknown>;
} {
  const structuredData: {
    organization?: Record<string, unknown>;
    business?: Record<string, unknown>;
    website?: Record<string, unknown>;
  } = {};

  // Extract JSON-LD scripts
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis);
  if (jsonLdMatches) {
    for (const match of jsonLdMatches) {
      try {
        const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '').trim();
        const data = JSON.parse(jsonContent);
        
        // Handle arrays of structured data
        const items = Array.isArray(data) ? data : [data];
        
        for (const item of items) {
          const itemObj = item as Record<string, unknown>;
          const type = (itemObj['@type'] || itemObj.type) as string | undefined;
          if (type === 'Organization' || type === 'Corporation' || type === 'LocalBusiness') {
            structuredData.organization = itemObj;
          }
          if (type === 'WebSite') {
            structuredData.website = itemObj;
          }
          if (type === 'LocalBusiness' || type === 'ProfessionalService') {
            structuredData.business = itemObj;
          }
        }
      } catch (e) {
        // Skip invalid JSON
        console.log('Failed to parse JSON-LD:', e);
      }
    }
  }

  // Extract Schema.org microdata (basic extraction)
  const schemaOrgMatches = html.match(/itemtype=["']https?:\/\/schema\.org\/(Organization|LocalBusiness|Corporation)["']/gi);
  if (schemaOrgMatches) {
    // Note: Full microdata parsing would require more complex parsing
    // This is a basic detection
  }

  return structuredData;
}

// Extract content analysis (headings, topics, writing style)
function analyzeContent(html: string): {
  headings: Array<{ level: number; text: string }>;
  topics: string[];
  word_count: number;
  content_structure: string;
} {
  // Remove script and style tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Extract headings
  const headings: Array<{ level: number; text: string }> = [];
  for (let level = 1; level <= 6; level++) {
    const regex = new RegExp(`<h${level}[^>]*>([^<]+)<\/h${level}>`, 'gi');
    const matches = text.matchAll(regex);
    for (const match of matches) {
      headings.push({
        level,
        text: match[1].trim()
      });
    }
  }

  // Extract paragraph content for word count
  const pMatches = text.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
  const paragraphs = pMatches.map(p => p.replace(/<[^>]+>/g, ' ').trim()).join(' ');
  const wordCount = paragraphs.split(/\s+/).filter(w => w.length > 0).length;

  // Extract topics from headings (first 10 unique)
  const topics = [...new Set(headings.slice(0, 20).map(h => h.text))].slice(0, 10);

  // Determine content structure
  let contentStructure = 'standard';
  if (headings.filter(h => h.level === 2).length > 5) {
    contentStructure = 'detailed';
  } else if (headings.length < 3) {
    contentStructure = 'minimal';
  }

  return {
    headings: headings.slice(0, 20),
    topics,
    word_count: wordCount,
    content_structure: contentStructure
  };
}

// Find additional pages (about, services, blog)
async function findAdditionalPages(baseUrl: string, html: string): Promise<Array<{ url: string; type: string; content?: string }>> {
  const urlObj = new URL(baseUrl);
  const baseDomain = `${urlObj.protocol}//${urlObj.hostname}`;
  const pages: Array<{ url: string; type: string; content?: string }> = [];

  // Common page patterns
  const pagePatterns = [
    { path: '/about', type: 'about' },
    { path: '/about-us', type: 'about' },
    { path: '/services', type: 'services' },
    { path: '/service', type: 'services' },
    { path: '/blog', type: 'blog' },
    { path: '/blog/', type: 'blog' },
    { path: '/news', type: 'blog' },
  ];

  // Also check for links in HTML
  const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi);
  const foundLinks = new Set<string>();
  
  for (const match of linkMatches) {
    const href = match[1];
    try {
      const linkUrl = new URL(href, baseUrl);
      if (linkUrl.hostname === urlObj.hostname) {
        const path = linkUrl.pathname.toLowerCase();
        if (path.includes('/about')) {
          foundLinks.add(linkUrl.toString());
        } else if (path.includes('/service') || path.includes('/product')) {
          foundLinks.add(linkUrl.toString());
        } else if (path.includes('/blog') || path.includes('/news') || path.includes('/article')) {
          foundLinks.add(linkUrl.toString());
        }
      }
    } catch {
      // Skip invalid URLs
    }
  }

  // Try to fetch common pages
  const pagesToCheck = [
    ...pagePatterns.map(p => ({ url: `${baseDomain}${p.path}`, type: p.type })),
    ...Array.from(foundLinks).slice(0, 3).map(url => ({ url, type: 'other' }))
  ];

  for (const page of pagesToCheck.slice(0, 5)) {
    try {
      const response = await fetch(page.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SearchFuel/1.0; +https://searchfuel.app)',
        },
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        const content = await response.text();
        pages.push({
          url: page.url,
          type: page.type,
          content: content.substring(0, 5000) // Limit content size
        });
      }
    } catch {
      // Skip failed fetches
    }
  }

  return pages;
}

// AI-powered business context understanding
async function analyzeBusinessContext(
  companyName: string,
  description: string,
  industry: string,
  contentAnalysis: ReturnType<typeof analyzeContent>,
  structuredData: ReturnType<typeof extractStructuredData>
): Promise<{
  enhanced_industry?: string;
  target_audience?: string;
  business_type?: string;
  value_proposition?: string;
}> {
  if (!LOVABLE_API_KEY) {
    return {};
  }

  try {
    const systemPrompt = `You are an expert business analyst. Analyze the provided business information and extract:
1. Most accurate industry classification
2. Target audience description
3. Business type (B2B, B2C, B2B2C, etc.)
4. Value proposition (what makes them unique)

Return ONLY a valid JSON object with these fields:
{
  "enhanced_industry": "string",
  "target_audience": "string",
  "business_type": "string",
  "value_proposition": "string"
}`;

    const userPrompt = `Company: ${companyName}
Description: ${description}
Detected Industry: ${industry}
Topics: ${contentAnalysis.topics.join(', ')}
Headings: ${contentAnalysis.headings.slice(0, 5).map(h => h.text).join(', ')}

${structuredData.organization ? `Structured Data: ${JSON.stringify(structuredData.organization).substring(0, 500)}` : ''}

Analyze this business and provide insights.`;

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
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        // Remove markdown code blocks if present
        const cleanContent = content.replace(/```json\n?|```\n?/g, '').trim();
        try {
          return JSON.parse(cleanContent);
        } catch {
          // If parsing fails, return empty
          return {};
        }
      }
    }
  } catch (error) {
    console.error('AI analysis error:', error);
  }

  return {};
}

// SERP-based competitor discovery using DataForSEO
async function discoverCompetitorsFromSERP(
  companyName: string,
  industry: string,
  description: string
): Promise<Array<{ domain: string; name?: string }>> {
  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
    return [];
  }

  try {
    // Create search query from company info
    const searchQuery = industry 
      ? `${industry} companies`
      : companyName 
        ? `companies like ${companyName}`
        : description.substring(0, 50);

    const serpResponse = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        keyword: searchQuery,
        location_code: 2840, // United States
        language_code: 'en',
        depth: 3
      }]),
      signal: AbortSignal.timeout(15000),
    });

    if (!serpResponse.ok) {
      return [];
    }

    const serpData = await serpResponse.json();
    
    if (serpData.status_code !== 20000) {
      return [];
    }

    const competitors: Array<{ domain: string; name?: string }> = [];
    const seenDomains = new Set<string>();

    const tasks = serpData.tasks || [];
    for (const task of tasks) {
      if (!task.result || !task.result[0]?.items) continue;
      
      for (const item of task.result[0].items.slice(0, 10)) {
        if (item.type === 'organic' && item.url) {
          try {
            const domain = new URL(item.url).hostname.replace(/^www\./, '');
            
            // Skip if we've seen this domain or if it's a social media/generic site
            if (seenDomains.has(domain) || 
                domain.includes('facebook.com') ||
                domain.includes('linkedin.com') ||
                domain.includes('twitter.com') ||
                domain.includes('youtube.com') ||
                domain.includes('wikipedia.org')) {
              continue;
            }

            seenDomains.add(domain);
            competitors.push({
              domain,
              name: item.title || undefined
            });

            if (competitors.length >= 7) break;
          } catch (e) {
            // Skip invalid URLs
          }
        }
      }
      
      if (competitors.length >= 7) break;
    }

    return competitors;
  } catch (error) {
    console.error('SERP competitor discovery error:', error);
    return [];
  }
}

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

// Enhanced business info extraction using structured data
function extractEnhancedBusinessInfo(
  html: string,
  url: string,
  structuredData: ReturnType<typeof extractStructuredData>
): {
  company_name: string;
  company_description: string;
  industry: string;
  language: string;
} {
  // Start with basic extraction
  const basicInfo = extractBusinessInfo(html, url);

  // Enhance with structured data
  if (structuredData.organization) {
    const org = structuredData.organization;
    
    // Use structured data name if available
    const orgName = org.name as string | undefined;
    if (orgName && orgName.trim()) {
      basicInfo.company_name = orgName.trim();
    }
    
    // Use structured data description if available
    const orgDesc = org.description as string | undefined;
    const orgAbout = org.about as string | undefined;
    if (orgDesc && orgDesc.trim()) {
      basicInfo.company_description = orgDesc.trim();
    } else if (orgAbout && orgAbout.trim()) {
      basicInfo.company_description = orgAbout.trim();
    }
  }

  if (structuredData.business) {
    const business = structuredData.business;
    
    // Extract industry from business type
    const businessType = business['@type'] as string | undefined;
    if (businessType && !basicInfo.industry) {
      const typeStr = businessType.replace('https://schema.org/', '');
      if (typeStr.includes('LocalBusiness')) {
        // Try to extract from additionalType or serviceType
        const additionalType = business.additionalType;
        if (additionalType) {
          const typeValue = Array.isArray(additionalType) 
            ? additionalType[0] 
            : additionalType;
          if (typeof typeValue === 'string') {
            basicInfo.industry = typeValue;
          }
        }
      }
    }
  }

  return basicInfo;
}

// Generate competitors using SERP data
async function generateCompetitors(
  url: string,
  companyName: string,
  industry: string,
  description: string
): Promise<Array<{ domain: string; name?: string }>> {
  // Use SERP-based discovery
  const serpCompetitors = await discoverCompetitorsFromSERP(companyName, industry, description);
  
  // Filter out the current website
  try {
    const urlObj = new URL(url);
    const currentDomain = urlObj.hostname.replace(/^www\./, '');
    return serpCompetitors.filter(c => c.domain !== currentDomain);
  } catch {
    return serpCompetitors;
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

    // Extract structured data (JSON-LD, Schema.org)
    console.log('Extracting structured data...');
    const structuredData = extractStructuredData(html);

    // Extract enhanced business information
    console.log('Extracting business information...');
    const businessInfo = extractEnhancedBusinessInfo(html, url, structuredData);

    // Analyze content (headings, topics, structure)
    console.log('Analyzing content...');
    const contentAnalysis = analyzeContent(html);

    // Find and analyze additional pages (about, services, blog)
    console.log('Finding additional pages...');
    const additionalPages = await findAdditionalPages(url, html);

    // AI-powered business context understanding
    console.log('Analyzing business context with AI...');
    const aiInsights = await analyzeBusinessContext(
      businessInfo.company_name,
      businessInfo.company_description,
      businessInfo.industry,
      contentAnalysis,
      structuredData
    );

    // Generate competitors using SERP data
    console.log('Discovering competitors from SERP...');
    const competitors = await generateCompetitors(
      url,
      businessInfo.company_name,
      businessInfo.industry || aiInsights.enhanced_industry || '',
      businessInfo.company_description
    );

    // Combine all insights
    const enhancedIndustry = aiInsights.enhanced_industry || businessInfo.industry;
    const enhancedDescription = businessInfo.company_description || '';

    // Return enhanced structured response
    return new Response(
      JSON.stringify({
        success: true,
        businessInfo: {
          company_name: businessInfo.company_name,
          company_description: enhancedDescription,
          industry: enhancedIndustry,
          language: businessInfo.language,
          target_audience: aiInsights.target_audience,
          business_type: aiInsights.business_type,
          value_proposition: aiInsights.value_proposition,
        },
        competitors: competitors,
        content_analysis: {
          headings: contentAnalysis.headings,
          topics: contentAnalysis.topics,
          word_count: contentAnalysis.word_count,
          content_structure: contentAnalysis.content_structure,
        },
        additional_pages: additionalPages.map(p => ({
          url: p.url,
          type: p.type
        })),
        structured_data_found: !!(structuredData.organization || structuredData.business || structuredData.website),
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

