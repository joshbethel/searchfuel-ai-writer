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
  enhanced_description?: string;
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
2. Enhanced company description (improve/clarify the provided description, make it professional and comprehensive)
3. Target audience description
4. Business type (B2B, B2C, B2B2C, etc.)
5. Value proposition (what makes them unique)

Return ONLY a valid JSON object with these fields:
{
  "enhanced_industry": "string",
  "enhanced_description": "string (improved version of the company description, 2-3 sentences, professional)",
  "target_audience": "string",
  "business_type": "string",
  "value_proposition": "string"
}`;

    const userPrompt = `Company: ${companyName}
Current Description: ${description || 'No description provided'}
Detected Industry: ${industry || 'Unknown'}
Topics: ${contentAnalysis.topics.join(', ') || 'None'}
Headings: ${contentAnalysis.headings.slice(0, 5).map(h => h.text).join(', ') || 'None'}

${structuredData.organization ? `Structured Data: ${JSON.stringify(structuredData.organization).substring(0, 500)}` : ''}

Analyze this business and provide insights. If the description is missing or incomplete, create a comprehensive professional description based on the available information.`;

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

// Extract specific services and products from company information
async function extractServicesAndProducts(
  companyName: string,
  description: string,
  industry: string,
  valueProposition?: string,
  contentAnalysis?: ReturnType<typeof analyzeContent>
): Promise<{ services: string[]; products: string[] }> {
  if (!LOVABLE_API_KEY) {
    // Fallback: try to extract from description using keywords
    const services: string[] = [];
    const products: string[] = [];
    
    const descLower = description.toLowerCase();
    const serviceKeywords = ['software', 'platform', 'tool', 'service', 'solution', 'app', 'system'];
    const productKeywords = ['product', 'device', 'equipment'];
    
    // Basic extraction from description
    const words = description.split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      const word = words[i].toLowerCase();
      if (serviceKeywords.some(kw => word.includes(kw))) {
        const phrase = words.slice(Math.max(0, i - 1), i + 2).join(' ');
        if (phrase.length > 5 && phrase.length < 50) {
          services.push(phrase);
        }
      }
    }
    
    return { services: [...new Set(services)].slice(0, 5), products: [...new Set(products)].slice(0, 5) };
  }

  try {
    const systemPrompt = `You are an expert business analyst. Extract specific services and products that a company offers.

Return ONLY a valid JSON object with these fields:
{
  "services": ["service 1", "service 2", ...],
  "products": ["product 1", "product 2", ...]
}

Rules:
- Extract specific, concrete services/products (e.g., "project management software", "cloud hosting", "email marketing platform")
- NOT generic categories (e.g., NOT "software", "services", "solutions")
- Focus on what customers would search for when looking for alternatives
- Maximum 7 services and 7 products
- If unclear, return empty arrays`;

    const userPrompt = `Company: ${companyName}
Industry: ${industry || 'Unknown'}
Description: ${description || 'No description'}
${valueProposition ? `Value Proposition: ${valueProposition}` : ''}
${contentAnalysis?.topics?.length ? `Topics: ${contentAnalysis.topics.join(', ')}` : ''}

Extract the specific services and products this company offers. Be specific and concrete.`;

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
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        const cleanContent = content.replace(/```json\n?|```\n?/g, '').trim();
        try {
          const extracted = JSON.parse(cleanContent);
          return {
            services: Array.isArray(extracted.services) ? extracted.services.slice(0, 7) : [],
            products: Array.isArray(extracted.products) ? extracted.products.slice(0, 7) : []
          };
        } catch {
          // Fall through to fallback
        }
      }
    }
  } catch (error) {
    console.error('Error extracting services/products:', error);
  }

  return { services: [], products: [] };
}

// Generate intelligent search queries using AI with service-specific focus
async function generateCompetitorSearchQueries(
  companyName: string,
  industry: string,
  description: string,
  businessType?: string,
  valueProposition?: string,
  targetAudience?: string,
  services?: string[],
  products?: string[]
): Promise<string[]> {
  if (!LOVABLE_API_KEY) {
    // Fallback to service/product-specific queries if available
    const queries: string[] = [];
    
    // Use services/products for specific queries
    if (services && services.length > 0) {
      for (const service of services.slice(0, 3)) {
        queries.push(`${service} alternatives`);
        queries.push(`${service} competitors`);
      }
    }
    if (products && products.length > 0) {
      for (const product of products.slice(0, 2)) {
        queries.push(`${product} alternatives`);
      }
    }
    
    // Fallback to company name queries
    if (companyName && queries.length < 3) {
      const cleanName = companyName.replace(/&#\d+;/g, '').replace(/[–—]/g, '').trim();
      queries.push(`${cleanName} competitors`);
      queries.push(`alternatives to ${cleanName}`);
    }
    
    // Last resort: industry queries (but more specific)
    if (queries.length < 3 && industry && businessType) {
      queries.push(`${businessType} ${industry} companies`);
    }
    
    return queries.slice(0, 7);
  }

  try {
    const systemPrompt = `You are an expert SEO and market research analyst. Generate 5-7 HIGHLY SPECIFIC Google search queries to find DIRECT competitors.

CRITICAL: Generate queries that target companies offering the EXACT SAME services/products, NOT just the same industry.

Query Format Guidelines:
- Use service/product names + "alternatives" or "competitors"
- Use specific service descriptions + "software" or "platform"
- Include business model (B2B/B2C) when relevant
- Avoid generic queries like "industry companies" or "top companies"
- Focus on what customers search when looking for alternatives

Examples of GOOD queries:
- "project management software alternatives"
- "B2B email marketing platform competitors"
- "cloud hosting services for small business"
- "CRM software for sales teams"

Examples of BAD queries (too generic):
- "SaaS companies"
- "top software companies"
- "best tech companies"

Return ONLY a JSON array of search query strings, nothing else:
["query 1", "query 2", "query 3", ...]`;

    const userPrompt = `Company: ${companyName}
Industry: ${industry || 'Unknown'}
Description: ${description || 'No description'}
Business Type: ${businessType || 'Unknown'}
Value Proposition: ${valueProposition || 'Unknown'}
Target Audience: ${targetAudience || 'Unknown'}
${services && services.length > 0 ? `Services: ${services.join(', ')}` : ''}
${products && products.length > 0 ? `Products: ${products.join(', ')}` : ''}

Generate HIGHLY SPECIFIC search queries to find DIRECT competitors. Focus on:
1. Companies offering the EXACT SAME services/products (use service/product names in queries)
2. Alternative solutions to specific services/products
3. Competitors targeting the same audience with similar offerings
4. Use service/product names + "alternatives" or "competitors" format

DO NOT generate generic industry queries. Be specific and concrete.`;

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
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        const cleanContent = content.replace(/```json\n?|```\n?/g, '').trim();
        try {
          const queries = JSON.parse(cleanContent);
          if (Array.isArray(queries) && queries.length > 0) {
            return queries.slice(0, 7); // Limit to 7 queries
          }
        } catch {
          // Fall through to fallback
        }
      }
    }
  } catch (error) {
    console.error('Error generating AI search queries:', error);
  }

  // Fallback queries
  const queries: string[] = [];
  if (industry) {
    queries.push(`${industry} companies`);
    queries.push(`top ${industry} companies`);
    queries.push(`best ${industry} services`);
    if (businessType) {
      queries.push(`${businessType} ${industry} companies`);
    }
  }
  if (companyName) {
    const cleanName = companyName.replace(/&#\d+;/g, '').replace(/[–—]/g, '').trim();
    queries.push(`${cleanName} competitors`);
    queries.push(`companies like ${cleanName}`);
  }
  return queries.slice(0, 7);
}

// Validate competitor relevance by analyzing their website content
async function validateCompetitorRelevance(
  competitorUrl: string,
  competitorDomain: string,
  companyName: string,
  companyDescription: string,
  industry: string,
  businessType?: string,
  services?: string[],
  products?: string[]
): Promise<{ isCompetitor: boolean; relevanceScore: number; reason: string }> {
  // Default: assume not a competitor until validated
  const defaultResult = { isCompetitor: false, relevanceScore: 0, reason: 'Failed to validate' };

  if (!LOVABLE_API_KEY) {
    // Without AI, we can't validate - be conservative
    return defaultResult;
  }

  try {
    // Fetch competitor homepage (quick fetch with timeout)
    const competitorResponse = await fetch(competitorUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SearchFuel/1.0; +https://searchfuel.app)',
      },
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (!competitorResponse.ok) {
      return { ...defaultResult, reason: 'Failed to fetch competitor website' };
    }

    const competitorHtml = await competitorResponse.text();
    
    // Extract basic info from competitor site
    const titleMatch = competitorHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    const descMatch = competitorHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const metaDesc = descMatch ? descMatch[1].trim() : '';
    
    // Extract first paragraph or hero section
    let contentPreview = '';
    const heroMatch = competitorHtml.match(/<section[^>]*class=["'][^"']*hero[^"']*["'][^>]*>(.*?)<\/section>/is);
    const mainMatch = competitorHtml.match(/<main[^>]*>(.*?)<\/main>/is);
    const contentSection = heroMatch?.[1] || mainMatch?.[1] || competitorHtml;
    
    const pMatches = contentSection.match(/<p[^>]*>([^<]{50,300})<\/p>/gi);
    if (pMatches && pMatches.length > 0) {
      contentPreview = pMatches.slice(0, 2)
        .map(p => p.replace(/<[^>]+>/g, ' ').trim())
        .join(' ')
        .substring(0, 500);
    }

    // Use AI to validate if this is a true competitor
    const systemPrompt = `You are an expert market research analyst. Determine if a website represents a DIRECT COMPETITOR of a company.

A DIRECT COMPETITOR must meet ALL of these criteria:
1. Offers similar or the same services/products (not just same industry)
2. Targets similar customer base/audience
3. Has similar business model (B2B vs B2C must match)
4. Customers would consider them as an alternative solution

NOT a competitor if:
- Offers complementary services (partner/integration)
- Different business model (B2B vs B2C mismatch)
- Different target audience
- Only in same broad industry but different services

Return ONLY a valid JSON object:
{
  "isCompetitor": true/false,
  "relevanceScore": 0-100 (how similar they are, 0 = not competitor, 100 = direct competitor),
  "reason": "brief explanation of why they are/aren't a competitor"
}`;

    const userPrompt = `Company Looking For Competitors:
Name: ${companyName}
Industry: ${industry || 'Unknown'}
Description: ${companyDescription || 'No description'}
Business Type: ${businessType || 'Unknown'}
${services && services.length > 0 ? `Services: ${services.join(', ')}` : ''}
${products && products.length > 0 ? `Products: ${products.join(', ')}` : ''}

Potential Competitor Website:
Domain: ${competitorDomain}
Title: ${title || 'No title'}
Meta Description: ${metaDesc || 'No description'}
Content Preview: ${contentPreview || 'No content available'}

Is this website a DIRECT COMPETITOR? Analyze if they offer similar services/products and target the same audience.`;

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
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        const cleanContent = content.replace(/```json\n?|```\n?/g, '').trim();
        try {
          const validation = JSON.parse(cleanContent);
          return {
            isCompetitor: validation.isCompetitor === true,
            relevanceScore: typeof validation.relevanceScore === 'number' 
              ? Math.max(0, Math.min(100, validation.relevanceScore)) 
              : 0,
            reason: validation.reason || 'Validated by AI'
          };
        } catch {
          // Fall through to default
        }
      }
    }
  } catch (error) {
    console.error(`Error validating competitor ${competitorDomain}:`, error);
    // On error, be conservative - don't include as competitor
    return { ...defaultResult, reason: 'Validation error' };
  }

  return defaultResult;
}

// SERP-based competitor discovery using DataForSEO with enhanced search strategies
async function discoverCompetitorsFromSERP(
  companyName: string,
  industry: string,
  description: string,
  businessType?: string,
  valueProposition?: string,
  targetAudience?: string,
  contentAnalysis?: ReturnType<typeof analyzeContent>
): Promise<Array<{ domain: string; name?: string }>> {
  console.log('Starting enhanced competitor discovery with:', { 
    companyName, 
    industry, 
    businessType, 
    valueProposition,
    targetAudience 
  });
  
  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
    console.warn('DataForSEO credentials not configured - DATAFORSEO_LOGIN:', !!DATAFORSEO_LOGIN, 'DATAFORSEO_PASSWORD:', !!DATAFORSEO_PASSWORD);
    return [];
  }

  try {
    // Phase 1: Extract specific services/products first
    console.log('Extracting services and products...');
    const { services, products } = await extractServicesAndProducts(
      companyName,
      description,
      industry,
      valueProposition,
      contentAnalysis
    );
    console.log(`Extracted ${services.length} services and ${products.length} products:`, { services, products });

    // Phase 1: Generate service/product-specific search queries
    console.log('Generating competitor search queries...');
    const searchQueries = await generateCompetitorSearchQueries(
      companyName,
      industry,
      description,
      businessType,
      valueProposition,
      targetAudience,
      services,
      products
    );
    
    console.log(`Generated ${searchQueries.length} search queries:`, searchQueries);

    // Clean company name for filtering
    const cleanCompanyName = companyName.replace(/&#\d+;/g, '').replace(/[–—]/g, '').trim().toLowerCase();
    const companyNameWords = cleanCompanyName.split(/\s+/).filter(w => w.length > 2);

    // Helper function to execute a single SERP query
    const executeSERPQuery = async (query: string): Promise<Array<{ domain: string; name?: string; score?: number; url?: string; snippet?: string }>> => {
      const endpoint = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';
      const competitors: Array<{ domain: string; name?: string; score?: number; url?: string; snippet?: string }> = [];
      
      try {
        const serpResponse = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{
            keyword: query,
            location_code: 2840, // United States
            language_code: 'en',
            depth: 5, // Get 5 pages per query (reduced since we're running multiple queries)
            sort_by: 'relevance',
            calculate_rectangles: false
          }]),
          signal: AbortSignal.timeout(15000),
        });

        if (!serpResponse.ok) {
          console.warn(`Query "${query}" failed with status: ${serpResponse.status}`);
          return [];
        }

        const serpData = await serpResponse.json();
        
        if (serpData.status_code !== 20000) {
          console.warn(`Query "${query}" returned status_code: ${serpData.status_code}`);
          return [];
        }

        const tasks = serpData.tasks || [];
        
        for (const task of tasks) {
          if (!task.result || !Array.isArray(task.result) || task.result.length === 0) {
            continue;
          }
          
          for (const resultPage of task.result) {
            if (!resultPage?.items || !Array.isArray(resultPage.items)) {
              continue;
            }
            
            for (const item of resultPage.items) {
              if (item.type === 'organic' && item.url) {
                try {
                  const domain = new URL(item.url).hostname.replace(/^www\./, '');
                  const domainLower = domain.toLowerCase();
                  
                  // Enhanced filtering - skip non-competitor sites
                  const skipPatterns = [
                    'facebook.com', 'linkedin.com', 'twitter.com', 'x.com',
                    'youtube.com', 'wikipedia.org', 'reddit.com', 'pinterest.com',
                    'instagram.com', 'tiktok.com', 'quora.com', 'medium.com',
                    'blogspot.com', 'wordpress.com', 'wix.com', 'squarespace.com',
                    'amazon.com', 'ebay.com', 'etsy.com', 'shopify.com',
                    'google.com', 'microsoft.com', 'apple.com', 'adobe.com'
                  ];
                  
                  if (skipPatterns.some(pattern => domainLower.includes(pattern))) {
                    continue;
                  }
                  
                  // Skip if domain contains company name (likely the company itself)
                  if (companyNameWords.some(word => domainLower.includes(word.toLowerCase()))) {
                    continue;
                  }
                  
                  // Skip directories, aggregators, and generic sites
                  if (domainLower.includes('directory') || 
                      domainLower.includes('list') || 
                      domainLower.includes('top-') ||
                      domainLower.includes('best-') ||
                      domainLower.includes('.gov') ||
                      domainLower.includes('.edu') ||
                      domainLower.includes('crunchbase') ||
                      domainLower.includes('zoominfo')) {
                    continue;
                  }
                  
                  // Calculate base relevance score based on position
                  const position = item.rank_absolute || 999;
                  let score = Math.max(0, 100 - position); // Higher score for better positions
                  
                  // Boost score if title/domain contains industry keywords
                  if (industry) {
                    const industryLower = industry.toLowerCase();
                    if (item.title?.toLowerCase().includes(industryLower) || 
                        domainLower.includes(industryLower)) {
                      score += 20;
                    }
                  }
                  
                  // Store snippet for later validation
                  const snippet = item.snippet || item.description || '';
                  
                  competitors.push({
                    domain,
                    name: item.title || undefined,
                    score,
                    url: item.url,
                    snippet
                  });
                } catch (e) {
                  console.warn('Failed to parse URL:', item.url, 'error:', e);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error executing query "${query}":`, error);
      }
      
      return competitors;
    };

    // Execute all queries in parallel (with limit to avoid rate limits)
    console.log(`Executing ${searchQueries.length} search queries...`);
    const queryResults = await Promise.all(
      searchQueries.slice(0, 5).map(query => executeSERPQuery(query))
    );
    
    // Combine and deduplicate results
    const competitorMap = new Map<string, { 
      domain: string; 
      name?: string; 
      score: number; 
      queryCount: number;
      url?: string;
      snippet?: string;
    }>();
    
    for (const results of queryResults) {
      for (const competitor of results) {
        const existing = competitorMap.get(competitor.domain);
        if (existing) {
          // If domain appears in multiple queries, it's more likely a competitor - boost score
          existing.score = Math.max(existing.score, competitor.score || 0) + 10;
          existing.queryCount += 1;
          // Keep the best URL (prefer https, prefer shorter paths)
          if (competitor.url && (!existing.url || competitor.url.length < existing.url.length)) {
            existing.url = competitor.url;
          }
          if (competitor.snippet && !existing.snippet) {
            existing.snippet = competitor.snippet;
          }
        } else {
          competitorMap.set(competitor.domain, {
            domain: competitor.domain,
            name: competitor.name,
            score: competitor.score || 0,
            queryCount: 1,
            url: competitor.url,
            snippet: competitor.snippet
          });
        }
      }
    }
    
    // Phase 2: Validate competitors with content analysis
    console.log(`Validating ${competitorMap.size} potential competitors...`);
    const validatedCompetitors: Array<{
      domain: string;
      name?: string;
      score: number;
      queryCount: number;
      relevanceScore: number;
      validationReason: string;
    }> = [];
    
    // Process top candidates first (limit validation to top 15 to avoid too many API calls)
    const candidatesToValidate = Array.from(competitorMap.values())
      .sort((a, b) => {
        if (b.queryCount !== a.queryCount) {
          return b.queryCount - a.queryCount;
        }
        return b.score - a.score;
      })
      .slice(0, 15);
    
    // Validate competitors in parallel (but limit concurrency to avoid rate limits)
    const validationPromises = candidatesToValidate.map(async (candidate) => {
      const competitorUrl = candidate.url || `https://${candidate.domain}`;
      
      const validation = await validateCompetitorRelevance(
        competitorUrl,
        candidate.domain,
        companyName,
        description,
        industry,
        businessType,
        services,
        products
      );
      
      if (validation.isCompetitor && validation.relevanceScore >= 40) {
        // Combine SERP score with validation score
        const combinedScore = (candidate.score * 0.3) + (validation.relevanceScore * 0.7);
        
        return {
          domain: candidate.domain,
          name: candidate.name,
          score: candidate.score,
          queryCount: candidate.queryCount,
          relevanceScore: validation.relevanceScore,
          validationReason: validation.reason,
          combinedScore
        };
      }
      
      return null;
    });
    
    const validationResults = await Promise.all(validationPromises);
    
    // Filter out null results and sort by combined score
    for (const result of validationResults) {
      if (result) {
        validatedCompetitors.push({
          domain: result.domain,
          name: result.name,
          score: result.score,
          queryCount: result.queryCount,
          relevanceScore: result.relevanceScore,
          validationReason: result.validationReason
        });
      }
    }
    
    // Sort by relevance score (from validation) first, then by queryCount, then by SERP score
    validatedCompetitors.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      if (b.queryCount !== a.queryCount) {
        return b.queryCount - a.queryCount;
      }
      return b.score - a.score;
    });
    
    // Return top 7 validated competitors
    const finalCompetitors = validatedCompetitors
      .slice(0, 7)
      .map(c => ({
        domain: c.domain,
        name: c.name
      }));
    
    console.log(`Found ${finalCompetitors.length} validated competitors from ${searchQueries.length} queries`);
    console.log('Final competitors:', finalCompetitors);
    
    // If we have fewer than 3 validated competitors, log a warning
    if (finalCompetitors.length < 3) {
      console.warn(`Only found ${finalCompetitors.length} validated competitors. Consider relaxing validation criteria.`);
    }
    
    return finalCompetitors;
  } catch (error) {
    console.error('SERP competitor discovery error:', error);
    if (error instanceof Error) {
      console.error('Error details:', { message: error.message, stack: error.stack });
    }
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
  
  // Extract description from actual content if meta tags are missing or short
  let companyDescription = ogDesc || description || '';
  
  // If description is missing or too short, try to extract from page content
  if (!companyDescription || companyDescription.length < 50) {
    // Remove script and style tags
    let cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleanHtml = cleanHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Try to find hero section or main content
    const heroMatch = cleanHtml.match(/<section[^>]*class=["'][^"']*hero[^"']*["'][^>]*>(.*?)<\/section>/is);
    const mainMatch = cleanHtml.match(/<main[^>]*>(.*?)<\/main>/is);
    const articleMatch = cleanHtml.match(/<article[^>]*>(.*?)<\/article>/is);
    
    const contentSection = heroMatch?.[1] || mainMatch?.[1] || articleMatch?.[1] || cleanHtml;
    
    // Extract first few paragraphs
    const pMatches = contentSection.match(/<p[^>]*>([^<]+)<\/p>/gi);
    if (pMatches && pMatches.length > 0) {
      const paragraphs = pMatches.slice(0, 3)
        .map(p => p.replace(/<[^>]+>/g, ' ').trim())
        .filter(p => p.length > 20)
        .join(' ');
      
      if (paragraphs.length > 50) {
        companyDescription = paragraphs.substring(0, 300).trim();
      }
    }
    
    // If still no description, try to extract from first div with substantial text
    if (!companyDescription || companyDescription.length < 50) {
      const divMatches = contentSection.match(/<div[^>]*>([^<]{100,500})<\/div>/gi);
      if (divMatches && divMatches.length > 0) {
        const divText = divMatches[0]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 300);
        if (divText.length > 50) {
          companyDescription = divText;
        }
      }
    }
  }
  
  // Decode HTML entities
  if (companyDescription) {
    companyDescription = companyDescription
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
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

// Generate competitors using SERP data with enhanced discovery
async function generateCompetitors(
  url: string,
  companyName: string,
  industry: string,
  description: string,
  businessType?: string,
  valueProposition?: string,
  targetAudience?: string,
  contentAnalysis?: ReturnType<typeof analyzeContent>
): Promise<Array<{ domain: string; name?: string }>> {
  // Use enhanced SERP-based discovery with multiple queries and validation
  const serpCompetitors = await discoverCompetitorsFromSERP(
    companyName, 
    industry, 
    description,
    businessType,
    valueProposition,
    targetAudience,
    contentAnalysis
  );
  
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

    // Generate competitors using enhanced SERP data with multiple search strategies and validation
    console.log('Discovering competitors from SERP with enhanced search and validation...');
    const competitors = await generateCompetitors(
      url,
      businessInfo.company_name,
      businessInfo.industry || aiInsights.enhanced_industry || '',
      businessInfo.company_description,
      aiInsights.business_type,
      aiInsights.value_proposition,
      aiInsights.target_audience,
      contentAnalysis
    );

    // Combine all insights
    const enhancedIndustry = aiInsights.enhanced_industry || businessInfo.industry;
    // Use AI-enhanced description if available, otherwise use extracted description
    const enhancedDescription = aiInsights.enhanced_description || businessInfo.company_description || '';

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

