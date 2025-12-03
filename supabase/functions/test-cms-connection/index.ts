// @ts-nocheck
// This file uses Deno runtime, not Node.js - TypeScript errors are expected
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { 
  testCmsConnectionSchema, 
  safeValidateRequest, 
  createValidationErrorResponse 
} from "../_shared/validation.ts";

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate request body with Zod schema
    const requestBody = await req.json();
    const validationResult = safeValidateRequest(testCmsConnectionSchema, requestBody);
    
    if (!validationResult.success) {
      return createValidationErrorResponse(validationResult, corsHeaders);
    }

    const { platform, siteUrl, apiKey, apiSecret, accessToken, username, password, accountId } = validationResult.data;

    // Basic URL validation for security
    if (siteUrl) {
      try {
        const urlObj = new URL(siteUrl);
        // Block localhost and private IPs
        if (urlObj.hostname === 'localhost' || 
            urlObj.hostname === '127.0.0.1' ||
            urlObj.hostname.startsWith('192.168.') ||
            urlObj.hostname.startsWith('10.') ||
            urlObj.hostname.startsWith('172.')) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Private URLs are not allowed for security reasons.'
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400,
            }
          );
        }
      } catch (error) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid site URL format.'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        );
      }
    }

    console.log(`Testing ${platform} connection for ${siteUrl}`);

    let success = false;
    let error = "";

    switch (platform) {
      case "wordpress":
        // Test WordPress REST API with username/password
        try {
          const response = await fetch(`${siteUrl}/wp-json/wp/v2/posts?per_page=1`, {
            headers: username && password ? { 
              'Authorization': `Basic ${btoa(`${username}:${password}`)}` 
            } : {},
          });
          success = response.ok;
          if (!success) {
            const errorText = await response.text();
            error = `Failed to connect to WordPress API: ${response.status} ${errorText}`;
          }
        } catch (e) {
          error = "Invalid WordPress site URL or API unavailable";
        }
        break;

      case "ghost":
        // Test Ghost Content API
        try {
          const response = await fetch(`${siteUrl}/ghost/api/v3/content/posts/?key=${apiKey}&limit=1`);
          success = response.ok;
          if (!success) error = "Invalid Ghost API key";
        } catch (e) {
          error = "Failed to connect to Ghost API";
        }
        break;

      case "webflow":
        // Test Webflow API
        try {
          const response = await fetch(`https://api.webflow.com/sites`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'accept-version': '1.0.0',
            },
          });
          success = response.ok;
          if (!success) error = "Invalid Webflow access token";
        } catch (e) {
          error = "Failed to connect to Webflow API";
        }
        break;

      case "shopify":
        // Test Shopify Admin API
        try {
          const shopDomain = new URL(siteUrl).hostname;
          const response = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
            headers: {
              'X-Shopify-Access-Token': accessToken || '',
            },
          });
          success = response.ok;
          if (!success) error = "Invalid Shopify credentials";
        } catch (e) {
          error = "Failed to connect to Shopify API";
        }
        break;

      case "notion":
        // Test Notion API
        try {
          const response = await fetch(`https://api.notion.com/v1/users/me`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Notion-Version': '2022-06-28',
            },
          });
          success = response.ok;
          if (!success) error = "Invalid Notion access token";
        } catch (e) {
          error = "Failed to connect to Notion API";
        }
        break;

      case "hubspot":
        // Test HubSpot API
        try {
          const response = await fetch(`https://api.hubapi.com/content/api/v2/blog-posts`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });
          success = response.ok;
          if (!success) error = "Invalid HubSpot access token";
        } catch (e) {
          error = "Failed to connect to HubSpot API";
        }
        break;

      case "rest_api":
        // Test custom REST API
        try {
          // Additional validation for REST API endpoint
          if (!siteUrl) {
            error = "REST API endpoint URL is required";
            break;
          }
          
          const restUrlValidation = await validateUrl(siteUrl);
          if (!restUrlValidation.isValid) {
            error = restUrlValidation.error || "Invalid REST API endpoint URL";
            break;
          }
          
          const response = await fetch(siteUrl, {
            headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
          });
          success = response.ok;
          if (!success) error = "Failed to connect to REST API";
        } catch (e) {
          error = "Invalid API endpoint or authentication";
        }
        break;

      case "framer":
        // Framer only requires URL verification
        try {
          if (!siteUrl) {
            success = false;
            error = "Framer site URL is required";
            break;
          }

          console.log(`Testing Framer site accessibility: ${siteUrl}`);
          
          // Simply verify the Framer site is accessible
          const response = await fetch(siteUrl, {
            method: 'HEAD',
          });

          success = response.ok || response.status === 405; // 405 is OK (HEAD might not be allowed)
          
          if (!success) {
            error = `Unable to access Framer site. Please verify the URL: ${siteUrl}`;
          } else {
            console.log("Successfully verified Framer site accessibility");
          }
        } catch (e) {
          success = false;
          error = `Failed to verify Framer site: ${e.message}`;
        }
        break;

      case "nextjs":
        // Test Next.js deployment accessibility
        try {
          const response = await fetch(siteUrl);
          success = response.ok;
          if (!success) error = "Cannot access Next.js site. Verify URL is correct.";
        } catch (e) {
          error = "Failed to access Next.js site";
        }
        break;

      case "wix":
        // Test Wix Blog API connection
        try {
          if (!apiKey) {
            error = "API Key is required";
            break;
          }
          // apiSecret stores the Site ID for Wix
          if (!apiSecret) {
            error = "Site ID is required";
            break;
          }
          if (!accountId) {
            error = "Account ID is required";
            break;
          }
          
          // Test connection by listing blog posts (limit to 1)
          const wixResponse = await fetch(
            `https://www.wixapis.com/blog/v3/posts?paging.limit=1`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
                'wix-site-id': apiSecret,
                'wix-account-id': accountId,
              }
            }
          );
          
          if (wixResponse.ok) {
            success = true;
          } else {
            const errorData = await wixResponse.text();
            console.error("Wix Blog API error:", wixResponse.status, errorData);
            if (wixResponse.status === 401 || wixResponse.status === 403) {
              error = "Invalid API Key or insufficient permissions. Ensure Blog permissions are granted.";
            } else if (wixResponse.status === 404) {
              error = "Wix Blog not found. Ensure your site has the Wix Blog app installed.";
            } else {
              error = `Wix Blog API error (${wixResponse.status}): ${errorData}`;
            }
          }
        } catch (e) {
          console.error("Wix connection error:", e);
          error = "Failed to connect to Wix Blog. Check your credentials.";
        }
        break;

      default:
        // For any other platforms
        success = true;
        error = "Connection not tested - manual verification required";
    }

    return new Response(
      JSON.stringify({ success, error: success ? null : error }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error testing CMS connection:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
