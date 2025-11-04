// @ts-nocheck
// This file uses Deno runtime, not Node.js - TypeScript errors are expected
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { platform, siteUrl, apiKey, apiSecret, accessToken, username, password } = await req.json();

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
        // Test Framer site accessibility
        try {
          const response = await fetch(siteUrl);
          success = response.ok;
          if (success) {
            error = "Site accessible. Note: Framer API integration requires Framer Pro plan and may need manual setup.";
          } else {
            error = "Cannot access site. Check URL and ensure site is published.";
          }
        } catch (e) {
          error = "Failed to access Framer site. Verify the URL is correct.";
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
        // Test Wix site accessibility
        try {
          const response = await fetch(siteUrl);
          success = response.ok;
          if (!success) error = "Cannot access Wix site. Verify URL is correct.";
        } catch (e) {
          error = "Failed to access Wix site";
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
