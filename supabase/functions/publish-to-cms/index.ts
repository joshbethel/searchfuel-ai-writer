// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getCorsHeaders } from "../_shared/cors.ts";
import { 
  publishToCmsSchema, 
  safeValidateRequest, 
  createValidationErrorResponse 
} from "../_shared/validation.ts";
import { marked } from "https://esm.sh/marked@11.1.1";
import createDOMPurify from "https://esm.sh/dompurify@3.0.6";
import { JSDOM } from "https://esm.sh/jsdom@23.0.1";

serve(async (req: any) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Store blog_post_id for error handler access
  let blog_post_id: string | undefined;

  try {
    // CRITICAL SECURITY: Authenticate user first
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let userId: string;

    // Support both Bearer token and Basic auth
    if (authHeader.startsWith("Basic ")) {
      // Basic auth: decode base64 username:password
      const base64Credentials = authHeader.replace("Basic ", "");
      const credentials = atob(base64Credentials);
      const [email, password] = credentials.split(":");

      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "Invalid basic auth credentials" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Authenticate with email/password
      const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !signInData.user) {
        console.error("Basic auth failed:", signInError);
        return new Response(
          JSON.stringify({ error: "Invalid credentials" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = signInData.user.id;
      console.log(`Authenticated user via Basic auth: ${userId}`);
    } else {
      // Bearer token auth (existing flow)
      const token = authHeader.replace("Bearer ", "");
      const { data, error: authError } = await supabaseClient.auth.getUser(token);
      
      if (authError || !data.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = data.user.id;
      console.log(`Authenticated user via Bearer token: ${userId}`);
    }

    // Validate request body with Zod schema
    const requestBody = await req.json();
    const validationResult = safeValidateRequest(publishToCmsSchema, requestBody);
    
    if (!validationResult.success) {
      return createValidationErrorResponse(validationResult, corsHeaders);
    }

    blog_post_id = validationResult.data.blog_post_id;
    console.log(`Publishing blog post ID: ${blog_post_id} for user: ${userId}`);

    // Use service role for database operations (after authentication)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the blog post WITH authorization check - verify user owns the blog
    // Use inner join to verify ownership, then fetch full blog data
    const { data: post, error: postError } = await supabase
      .from("blog_posts")
      .select("*, blogs!inner(id, user_id)")
      .eq("id", blog_post_id)
      .eq("blogs.user_id", userId)  // CRITICAL: Verify ownership
      .single();

    if (postError) {
      console.error("Error fetching post:", postError);
      return new Response(
        JSON.stringify({ error: "Post not found or unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!post) {
      return new Response(
        JSON.stringify({ error: "Post not found or unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found post: ${post.title} for blog ID: ${post.blog_id}`);

    // Now fetch the full blog data (ownership already verified above)
    const { data: blog, error: blogError } = await supabase
      .from("blogs")
      .select("*")
      .eq("id", post.blog_id)
      .eq("user_id", userId)  // Double-check ownership
      .single();

    if (blogError) {
      console.error("Error fetching blog:", blogError);
      return new Response(
        JSON.stringify({ error: "Blog not found or unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!blog) {
      return new Response(
        JSON.stringify({ error: "Blog not found or unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found blog: ${blog.title}, CMS: ${blog.cms_platform}, URL: ${blog.cms_site_url}`);

    if (!blog.cms_platform || !blog.cms_credentials) {
      return new Response(
        JSON.stringify({ error: "CMS platform or credentials not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Publishing to ${blog.cms_platform}: ${post.title}`);

    // Update status to publishing first
    await supabase
      .from("blog_posts")
      .update({
        publishing_status: "publishing",
      })
      .eq("id", blog_post_id);

    let externalPostId: string | null = null;
    let publishSuccess = false;

    // Route to appropriate CMS publisher
    switch (blog.cms_platform) {
      case "wordpress":
        externalPostId = await publishToWordPress(blog, post);
        publishSuccess = true;
        break;

      case "ghost":
        externalPostId = await publishToGhost(blog, post);
        publishSuccess = true;
        break;

      case "webflow":
        externalPostId = await publishToWebflow(blog, post);
        publishSuccess = true;
        break;

      case "shopify":
        externalPostId = await publishToShopify(blog, post);
        publishSuccess = true;
        break;

      case "hubspot":
        externalPostId = await publishToHubSpot(blog, post);
        publishSuccess = true;
        break;

      case "rest_api":
        externalPostId = await publishToRestAPI(blog, post);
        publishSuccess = true;
        break;

      case "framer":
        externalPostId = await publishToFramer(blog, post);
        publishSuccess = true;
        break;

      case "wix":
        externalPostId = await publishToWix(blog, post);
        publishSuccess = true;
        break;

      default:
        throw new Error(`Unsupported CMS platform: ${blog.cms_platform}`);
    }

    // Update blog post with external ID and status
    const { error: updateError } = await supabase
      .from("blog_posts")
      .update({
        external_post_id: externalPostId,
        publishing_status: publishSuccess ? "published" : "failed",
        last_published_at: new Date().toISOString(),
      })
      .eq("id", blog_post_id);

    if (updateError) {
      console.error("Error updating post status:", updateError);
      throw new Error(`Failed to update post status: ${updateError.message}`);
    }

    console.log(`Successfully published and updated post status`);

    return new Response(
      JSON.stringify({
        success: true,
        external_post_id: externalPostId,
        platform: blog.cms_platform,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    // Log full error details server-side (safe - not exposed to client)
    console.error("Error publishing to CMS:", error);
    console.error("Error stack:", error.stack);
    
    // Try to update the post status to failed if we have the blog_post_id
    if (blog_post_id) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from("blog_posts")
          .update({
            publishing_status: "failed",
          })
          .eq("id", blog_post_id);
      } catch (updateError) {
        console.error("Failed to update post status to failed:", updateError);
      }
    }
    
    // Determine if we're in development mode
    const isDevelopment = Deno.env.get("ENVIRONMENT") === "development" || 
                          Deno.env.get("DENO_ENV") === "development";
    
    // Only expose detailed error information in development
    // In production, return generic error message to prevent information disclosure
    return new Response(
      JSON.stringify({ 
        error: isDevelopment ? error.message : "Internal server error. Please try again later.",
        details: isDevelopment ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to convert markdown to HTML with XSS protection
function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  
  // Remove first H1 if present (since title is separate)
  const content = markdown.replace(/^#\s+.+$/m, '').trim();
  
  // Configure marked to be secure
  marked.setOptions({
    breaks: true, // Convert line breaks to <br>
    gfm: true, // GitHub Flavored Markdown
  });
  
  // Convert markdown to HTML using proper library
  const html = marked.parse(content) as string;
  
  // Create JSDOM window for DOMPurify (required for server-side use in Deno)
  const window = new JSDOM('').window;
  const DOMPurify = createDOMPurify(window as any);
  
  // Sanitize HTML to prevent XSS attacks
  // Only allow safe HTML tags and attributes
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'blockquote', 'hr'
    ],
    ALLOWED_ATTR: ['href', 'title', 'alt'],
    // Remove any script tags, event handlers, etc.
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
  });
  
  return sanitized;
}

// Helper function to extract actual content from JSON-wrapped content
function extractContent(rawContent: string): string {
  if (!rawContent) return '';
  
  // Check if content is wrapped in ```json code blocks
  if (rawContent.trim().startsWith('```json')) {
    // First try to extract the content field using regex (more reliable)
    const contentMatch = rawContent.match(/"content"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"|"\s*\})/);
    if (contentMatch && contentMatch[1]) {
      // Unescape the content
      const extracted = contentMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\t/g, '\t');
      console.log(`Extracted content via regex, length: ${extracted.length}`);
      return extracted;
    }
    
    // Fallback: try JSON parsing
    try {
      const jsonMatch = rawContent.match(/```json\s*\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        return parsed.content || rawContent;
      }
    } catch (e) {
      console.error('Failed to parse JSON content:', e);
    }
    
    // Last resort: strip the JSON wrapper and extract markdown content
    const strippedMatch = rawContent.match(/```json[\s\S]*?"content"\s*:\s*"([\s\S]+)$/);
    if (strippedMatch) {
      // Find where the actual content starts after "content": "
      let content = strippedMatch[1];
      // Remove trailing JSON artifacts
      content = content.replace(/"\s*,?\s*"(?:excerpt|title|featured_image)"[\s\S]*$/, '');
      content = content.replace(/"\s*\}\s*\n?```\s*$/, '');
      content = content
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      console.log(`Extracted content via stripping, length: ${content.length}`);
      return content;
    }
  }
  
  // If not JSON-wrapped, return as is
  return rawContent;
}

async function publishToWordPress(blog: any, post: any): Promise<string> {
  console.log(`Starting WordPress publishing for post: ${post.title}`);
  
  // 🔓 Decrypt credentials
  const encryptedCredentials = blog.cms_credentials;
  if (!encryptedCredentials) {
    throw new Error("WordPress credentials not found in database");
  }
  
  const credentials = await decryptBlogCredentials(encryptedCredentials);
  
  // Handle featured image first if available
  let featuredImageId = null;
  if (post.featured_image) {
    console.log("Uploading featured image to WordPress...");
    try {
      featuredImageId = await uploadWordPressMedia(blog, post.featured_image);
      console.log(`Successfully uploaded featured image. Media ID: ${featuredImageId}`);
    } catch (error) {
      console.error("Failed to upload featured image:", error);
      // Continue with post creation even if image upload fails
    }
  }
  
  // Extract username and password from decrypted credentials
  const username = credentials.username || credentials.apiKey;
  const password = credentials.password || credentials.apiSecret;
  
  if (!username || !password) {
    throw new Error("WordPress username and password are required. Please reconnect your WordPress site.");
  }
  
  // Validate site URL
  if (!blog.cms_site_url) {
    throw new Error("WordPress site URL not configured");
  }
  
  // Ensure URL doesn't end with slash and construct API URL
  const baseUrl = blog.cms_site_url.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/wp-json/wp/v2/posts`;
  
  console.log(`WordPress API URL: ${apiUrl}`);
  console.log(`Using username: ${username}`);

  // Extract actual content from JSON-wrapped format and convert to HTML
  const markdownContent = extractContent(post.content);
  const htmlContent = markdownToHtml(markdownContent);
  console.log(`Content converted to HTML, length: ${htmlContent.length} characters`);

  // Prepare post data with meta fields
  const postData = {
    title: post.title,
    content: htmlContent,
    excerpt: post.excerpt || "",
    status: "publish",
    featured_media: featuredImageId, // WordPress REST API field for featured image
    featured_image: featuredImageId, // Alternative field some WordPress installs use
    meta: {
      _yoast_wpseo_title: post.meta_title || post.title, // For Yoast SEO
      _yoast_wpseo_metadesc: post.meta_description || post.excerpt || "", // For Yoast SEO
      _aioseo_title: post.meta_title || post.title, // For All in One SEO
      _aioseo_description: post.meta_description || post.excerpt || "", // For All in One SEO
      _rank_math_title: post.meta_title || post.title, // For Rank Math SEO
      _rank_math_description: post.meta_description || post.excerpt || "", // For Rank Math SEO
    }
  };

  // Make the API request
  const authHeader = `Basic ${btoa(`${username}:${password}`)}`;
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
    },
    body: JSON.stringify(postData),
  });

  // Handle response
  if (!response.ok) {
    const errorText = await response.text();
    console.error("WordPress API Error Response:", {
      status: response.status,
      statusText: response.statusText,
      body: errorText
    });
    
    // Provide more specific error messages
    if (response.status === 401) {
      throw new Error("WordPress authentication failed - please reconnect your WordPress site");
    } else if (response.status === 403) {
      throw new Error("WordPress user doesn't have permission to publish posts");
    } else if (response.status === 404) {
      throw new Error("WordPress REST API not found - check site URL");
    } else {
      throw new Error(`WordPress API error (${response.status}): ${errorText}`);
    }
  }

  const data = await response.json();
  
  // After creating the post, update meta fields using different SEO plugin endpoints if available
  try {
    // Try Yoast SEO endpoint
    await fetch(`${baseUrl}/wp-json/yoast/v1/meta`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({
        post_id: data.id,
        meta: {
          title: post.meta_title || post.title,
          description: post.meta_description || post.excerpt || "",
        },
      }),
    });
  } catch (error) {
    console.log("Yoast SEO meta update failed, might not be installed");
  }

  console.log(`Successfully published to WordPress: ${data.link || data.guid?.rendered || 'Post ID: ' + data.id}`);
  
  return data.id.toString();
}

async function uploadShopifyImage(blog: any, imageUrl: string): Promise<string | null> {
  try {
    console.log("Attempting to upload image to Shopify:", imageUrl);

    // First validate the image URL
    if (!imageUrl.startsWith('http')) {
      console.error("Invalid image URL format:", imageUrl);
      return null;
    }

    // Fetch the image with timeout
    console.log("Fetching image content...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const imageResponse = await fetch(imageUrl, { 
      signal: controller.signal 
    }).finally(() => clearTimeout(timeoutId));

    if (!imageResponse.ok) {
      console.error(`Failed to fetch image: ${imageResponse.status} - ${imageResponse.statusText}`);
      return null;
    }

    // Validate content type
    const contentType = imageResponse.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      console.error("Invalid content type for image:", contentType);
      return null;
    }

    // Get file extension from content type
    const ext = contentType.split('/')[1] || 'jpg';

    // Convert image to base64
    console.log("Converting image to base64...");
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

    // Upload to Shopify
    // 🔓 Decrypt credentials
    const encryptedCredentials = blog.cms_credentials;
    if (!encryptedCredentials) {
      console.error("Missing Shopify credentials");
      return null;
    }
    const credentials = await decryptBlogCredentials(encryptedCredentials);
    if (!credentials || !credentials.access_token) {
      console.error("Missing Shopify access token");
      return null;
    }

    // Ensure URL is properly formatted
    const baseUrl = blog.cms_site_url.replace(/\/$/, '');
    const apiUrl = `${baseUrl}/admin/api/2024-01/articles/images.json`;

    console.log("Uploading to Shopify...");
    const uploadResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": credentials.access_token,
      },
      body: JSON.stringify({
        image: {
          attachment: base64Image,
          filename: `featured-image-${Date.now()}.${ext}`
        }
      })
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Shopify upload failed:", {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        error: errorText
      });
      return null;
    }

    const responseData = await uploadResponse.json();
    if (!responseData.image || !responseData.image.attachment) {
      console.error("Invalid response from Shopify:", responseData);
      return null;
    }

    console.log("Successfully uploaded image to Shopify");
    return responseData.image.attachment;
  } catch (error) {
    console.error("Error uploading image to Shopify:", {
      error: error.message,
      stack: error.stack,
      imageUrl
    });
    return null;
  }
}

// Helper function to decrypt credentials
async function decryptBlogCredentials(encryptedCredentials: any): Promise<any> {
  try {
    const { decryptCredentials } = await import("../_shared/encryption.ts");
    const encryptedString = typeof encryptedCredentials === 'string' 
      ? encryptedCredentials 
      : JSON.stringify(encryptedCredentials);
    return await decryptCredentials(encryptedString);
  } catch (error: any) {
    console.error("Decryption error:", error);
    // Fallback: try to use as plaintext (backward compatibility)
    if (typeof encryptedCredentials === 'string') {
      try {
        return JSON.parse(encryptedCredentials);
      } catch {
        throw new Error(`Failed to decrypt credentials: ${error.message}`);
      }
    }
    return encryptedCredentials;
  }
}

async function uploadWordPressMedia(blog: any, imageUrl: string): Promise<number | undefined> {
  // 🔓 Decrypt credentials
  const encryptedCredentials = blog.cms_credentials;
  if (!encryptedCredentials) {
    throw new Error("WordPress credentials missing");
  }
  
  const credentials = await decryptBlogCredentials(encryptedCredentials);
  const username = credentials.username || credentials.apiKey;
  const password = credentials.password || credentials.apiSecret;

  if (!username || !password) {
    throw new Error("WordPress credentials missing");
  }

  // Handle image data - could be base64 data URL or regular URL
  let imageBuffer: ArrayBuffer;
  console.log("Processing image:", imageUrl.substring(0, 100));
  
  if (imageUrl.startsWith('data:')) {
    // It's a base64 data URL
    console.log("Decoding base64 image data");
    const base64Data = imageUrl.split(',')[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    imageBuffer = bytes.buffer;
  } else {
    // It's a regular URL, fetch it
    console.log("Fetching image from URL");
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    imageBuffer = await imageResponse.arrayBuffer();
  }
  // Get the file extension from the image data
  let fileExtension = 'jpg'; // default
  if (imageUrl.startsWith('data:image/')) {
    // Extract format from data URL (e.g., data:image/png;base64,...)
    const match = imageUrl.match(/data:image\/(\w+);/);
    if (match) fileExtension = match[1];
  } else {
    // Extract from URL
    fileExtension = imageUrl.split('.').pop()?.toLowerCase() || 'jpg';
  }
  const filename = `featured-image-${Date.now()}.${fileExtension}`;

  // Upload to WordPress
  const baseUrl = blog.cms_site_url.replace(/\/$/, '');
  const mediaUrl = `${baseUrl}/wp-json/wp/v2/media`;
  const authHeader = `Basic ${btoa(`${username}:${password}`)}`;

  console.log("Uploading to WordPress media library:", mediaUrl);
  console.log("Image filename:", filename);
  
  // Determine content type based on file extension
  const contentType = fileExtension === 'png' ? 'image/png' : 
                     fileExtension === 'gif' ? 'image/gif' : 
                     'image/jpeg';

  const uploadResponse = await fetch(mediaUrl, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename=${filename}`
    },
    body: imageBuffer
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`WordPress media upload failed: ${uploadResponse.status} - ${errorText}`);
  }

  const mediaData = await uploadResponse.json();
  console.log("WordPress media upload response:", mediaData);

  if (!mediaData.id) {
    throw new Error("WordPress media upload succeeded but no media ID was returned");
  }
  console.log("Media upload successful. ID:", mediaData.id);
  
  return mediaData.id;
}

async function publishToGhost(blog: any, post: any): Promise<string> {
  // 🔓 Decrypt credentials
  const encryptedCredentials = blog.cms_credentials;
  if (!encryptedCredentials) {
    throw new Error("Ghost credentials not found");
  }
  const credentials = await decryptBlogCredentials(encryptedCredentials);
  const apiUrl = `${blog.cms_site_url}/ghost/api/v3/admin/posts/`;

  // Handle featured image if available
  let featureImage = post.featured_image;
  if (featureImage) {
    try {
      // Ghost can use external images directly, but we'll validate the URL
      const imageResponse = await fetch(featureImage, { method: 'HEAD' });
      if (!imageResponse.ok) {
        console.error("Featured image URL not accessible:", featureImage);
        featureImage = undefined;
      }
    } catch (error) {
      console.error("Error checking featured image:", error);
      featureImage = undefined;
    }
  }

  // Ghost requires JWT authentication
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Ghost ${credentials.admin_api_key}`,
    },
    body: JSON.stringify({
      posts: [
        {
          title: post.title,
          html: post.content,
          custom_excerpt: post.excerpt || "",
          status: "published",
          feature_image: featureImage,
          meta_title: post.meta_title || post.title,
          meta_description: post.meta_description || post.excerpt || "",
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ghost API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`Published to Ghost: ${data.posts[0].url}`);
  return data.posts[0].id;
}

async function publishToWebflow(blog: any, post: any): Promise<string> {
  // 🔓 Decrypt credentials
  const encryptedCredentials = blog.cms_credentials;
  if (!encryptedCredentials) {
    throw new Error("Webflow credentials not found");
  }
  const credentials = await decryptBlogCredentials(encryptedCredentials);
  const apiUrl = `https://api.webflow.com/collections/${credentials.collection_id}/items`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.api_token}`,
      "accept-version": "1.0.0",
    },
    body: JSON.stringify({
      fields: {
        name: post.title,
        slug: post.slug,
        "post-body": post.content,
        "post-summary": post.excerpt || "",
        _archived: false,
        _draft: false,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Webflow API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`Published to Webflow: ${data._id}`);
  return data._id;
}

async function publishToShopify(blog: any, post: any): Promise<string> {
  // 🔓 Decrypt credentials
  const encryptedCredentials = blog.cms_credentials;
  if (!encryptedCredentials) {
    throw new Error("Shopify credentials not found");
  }
  const credentials = await decryptBlogCredentials(encryptedCredentials);
  
  if (!credentials || !credentials.access_token) {
    throw new Error("Shopify access token not found");
  }

  // Validate and format the site URL
  let siteUrl = blog.cms_site_url || "";
  if (!siteUrl) {
    throw new Error("Shopify site URL not configured");
  }
  
  if (!siteUrl.startsWith('https://')) {
    siteUrl = 'https://' + siteUrl.replace(/^http:\/\//, '');
  }
  // Normalize domain: remove trailing slash and any /admin path
  siteUrl = siteUrl.replace(/\/$/, '').replace(/\/admin(?:\/.*)?$/, '');
  // Prefer myshopify.com domain if provided in credentials
  const shopDomain = credentials.shop_domain || credentials.shop || credentials.store_domain;
  if (shopDomain && !shopDomain.includes('://')) {
    siteUrl = `https://${shopDomain.replace(/\/$/, '')}`;
  }
  if (!siteUrl.includes('myshopify.com')) {
    console.warn('Shopify Admin API typically requires the myshopify.com domain. Current siteUrl:', siteUrl);
  }

  console.log("Starting Shopify publish process...");
  console.log("Store URL:", siteUrl);
  
  // First, verify store access
  const shopUrl = `${siteUrl}/admin/api/2024-01/shop.json`;
  console.log("Verifying shop access:", shopUrl);
  
  const shopResponse = await fetch(shopUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": credentials.access_token,
    }
  });

  if (!shopResponse.ok) {
    const shopError = await shopResponse.text();
    console.error("Shopify shop access error:", {
      status: shopResponse.status,
      error: shopError,
      url: shopUrl
    });
    throw new Error(`Cannot access Shopify store: ${shopResponse.status} - ${shopError}`);
  }

  console.log("Shop access verified successfully");

  // Get the list of blogs
  console.log("Fetching Shopify blogs...");
  const blogsUrl = `${siteUrl}/admin/api/2024-01/blogs.json`;
  const blogsResponse = await fetch(blogsUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": credentials.access_token,
    }
  });

  if (!blogsResponse.ok) {
    const blogsError = await blogsResponse.text();
    console.error("Shopify blogs fetch error:", {
      status: blogsResponse.status,
      error: blogsError,
      url: blogsUrl
    });
    throw new Error(`Failed to fetch Shopify blogs: ${blogsResponse.status} - ${blogsError}`);
  }

  const blogsData = await blogsResponse.json();
  console.log("Shopify blogs data:", JSON.stringify(blogsData, null, 2));
  
  if (!blogsData.blogs || blogsData.blogs.length === 0) {
    throw new Error("No blogs found in your Shopify store. Please create a blog in your Shopify admin first.");
  }

  // Use the first blog if blog_id is not specified
  const blogId = credentials.blog_id || blogsData.blogs[0].id;
  console.log("Using blog ID:", blogId);
  console.log("Available blogs:", blogsData.blogs.map((b: any) => ({ id: b.id, title: b.title })));
  
  if (!blogId) {
    throw new Error("Could not determine blog ID from Shopify response");
  }

  const apiUrl = `${siteUrl}/admin/api/2024-01/blogs/${blogId}/articles.json`;
  console.log("Publishing to URL:", apiUrl);

  // Handle featured image if available
  let imageUrl = null;
  if (post.featured_image) {
    try {
      // Shopify can use external images directly
      const imageResponse = await fetch(post.featured_image, { method: 'HEAD' });
      if (imageResponse.ok) {
        imageUrl = post.featured_image;
        console.log("Using featured image URL:", imageUrl);
      }
    } catch (error) {
      console.error("Error checking featured image:", error);
    }
  }

  const articleData: any = {
    article: {
      title: post.title,
      body_html: post.content,
      summary_html: post.excerpt || "",
      published: true,
      metafields: [
        {
          namespace: "seo",
          key: "title",
          value: post.meta_title || post.title,
          type: "single_line_text_field"
        },
        {
          namespace: "seo",
          key: "description",
          value: post.meta_description || post.excerpt || "",
          type: "single_line_text_field"
        }
      ]
    }
  };

  // Add image URL if we have one
  if (imageUrl) {
    articleData.article.image = { src: imageUrl };
  }

  console.log("Publishing article to Shopify...", {
    url: apiUrl,
    title: post.title,
    blogId: blogId
  });

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": credentials.access_token,
      },
      body: JSON.stringify(articleData),
    });

    const responseText = await response.text();
    console.log("Shopify API response:", {
      status: response.status,
      body: responseText
    });

    if (!response.ok) {
      throw new Error(`Shopify API error (${response.status}): ${responseText}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Invalid JSON response from Shopify: ${responseText}`);
    }

    if (!data.article || !data.article.id) {
      throw new Error(`Unexpected Shopify response format: ${JSON.stringify(data)}`);
    }

    console.log('Successfully published to Shopify:', {
      articleId: data.article.id,
      title: data.article.title,
      url: data.article.url
    });
    return data.article.id.toString();
  } catch (error: any) {
    console.error("Error publishing to Shopify:", {
      error: error.message,
      stack: error.stack,
      articleData: articleData
    });
    throw error;
  }
}

async function publishToHubSpot(blog: any, post: any): Promise<string> {
  // 🔓 Decrypt credentials
  const encryptedCredentials = blog.cms_credentials;
  if (!encryptedCredentials) {
    throw new Error("HubSpot credentials not found");
  }
  const credentials = await decryptBlogCredentials(encryptedCredentials);
  const apiUrl = `https://api.hubapi.com/content/api/v2/blog-posts`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.access_token}`,
    },
    body: JSON.stringify({
      name: post.title,
      post_body: post.content,
      post_summary: post.excerpt || "",
      content_group_id: credentials.blog_id,
      state: "PUBLISHED",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`Published to HubSpot: ${data.id}`);
  return data.id;
}

async function publishToRestAPI(blog: any, post: any): Promise<string> {
  // 🔓 Decrypt credentials
  const encryptedCredentials = blog.cms_credentials;
  if (!encryptedCredentials) {
    throw new Error("REST API credentials not found");
  }
  const credentials = await decryptBlogCredentials(encryptedCredentials);
  
  if (!credentials.endpoint_url) {
    throw new Error("REST API endpoint URL not found");
  }
  
  const response = await fetch(credentials.endpoint_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(credentials.auth_header && { [credentials.auth_header_name || "Authorization"]: credentials.auth_header }),
    },
    body: JSON.stringify({
      title: post.title,
      content: post.content,
      excerpt: post.excerpt || "",
      slug: post.slug,
      featured_image: post.featured_image || "",
      status: "published",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`REST API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`Published to REST API: ${credentials.endpoint_url}`);
  return data.id || data._id || "published";
}

async function publishToFramer(blog: any, post: any): Promise<string> {
  console.log(`Marking Framer post as published (manual sync): ${post.title}`);
  
  // For Framer, users manually sync in Framer CMS themselves
  // This function just marks the post as published in our database
  // and returns the blog_post_id as the "external_post_id"
  
  console.log(`✓ Framer post marked as published. Post ID: ${post.id}`);
  
  // Return the blog post ID as the external ID
  // Users will use this ID to sync manually in Framer
  return post.id;
}

async function publishToWix(blog: any, post: any): Promise<string> {
  console.log(`Starting Wix Blog publishing for post: ${post.title}`);
  
  // 🔓 Decrypt credentials
  const encryptedCredentials = blog.cms_credentials;
  if (!encryptedCredentials) {
    throw new Error("Wix credentials not found in database");
  }
  
  const credentials = await decryptBlogCredentials(encryptedCredentials);
  
  const apiKey = credentials.apiKey;
  const siteId = credentials.siteId;
  
  if (!apiKey || !siteId) {
    throw new Error("Wix API Key and Site ID are required. Please reconnect your Wix site.");
  }
  
  console.log(`Publishing to Wix Blog on site: ${siteId}`);
  
  // Extract actual content from JSON-wrapped format and convert to HTML
  const markdownContent = extractContent(post.content);
  const htmlContent = markdownToHtml(markdownContent);
  console.log(`Content converted to HTML, length: ${htmlContent.length} characters`);
  
  // Generate a URL-friendly slug
  const slug = post.slug || post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  
  // Build rich content nodes - use HTML node for proper rendering
  const richContentNodes: any[] = [];
  
  // Add the HTML content as a single full-width block
  if (htmlContent) {
    richContentNodes.push({
      type: "HTML",
      id: crypto.randomUUID(),
      nodes: [],
      htmlData: {
        containerData: {
          width: {
            size: "FULL_WIDTH"
          },
          alignment: "CENTER",
          textWrap: false
        },
        source: "HTML",
        html: `<div style="width:100%;max-width:100%;">${htmlContent}</div>`
      }
    });
  }
  
  // Fallback if no content
  if (richContentNodes.length === 0) {
    const plainText = htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    richContentNodes.push({
      type: "PARAGRAPH",
      id: crypto.randomUUID(),
      nodes: [{
        type: "TEXT",
        id: crypto.randomUUID(),
        textData: { text: plainText || "No content" }
      }],
      paragraphData: { textStyle: { textAlignment: "AUTO" } }
    });
  }
  
  // Prepare the blog post for Wix Blog API v3
  const blogPost: any = {
    post: {
      title: post.title,
      richContent: {
        nodes: richContentNodes
      },
      excerpt: post.excerpt || "",
      featured: false,
      commentingEnabled: true,
      seoData: {
        tags: [
          {
            type: "title",
            children: post.meta_title || post.title,
            custom: false,
            disabled: false
          },
          {
            type: "meta",
            props: {
              name: "description",
              content: post.meta_description || post.excerpt || ""
            },
            custom: false,
            disabled: false
          }
        ]
      },
      slug: slug
    }
  };
  
  // Upload featured image to Wix Media Manager FIRST before creating post
  let coverImageUrl: string | null = null;
  
  if (post.featured_image) {
    console.log(`Step 0: Uploading featured image to Wix Media Manager...`);
    
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    
    try {
      if (post.featured_image.startsWith('data:')) {
        // Handle base64 image - use multipart/form-data upload
        console.log(`Processing base64 image for Wix upload...`);
        
        // Extract base64 data and mime type
        const matches = post.featured_image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          const extension = mimeType.split('/')[1] || 'jpg';
          const fileName = `blog-cover-${Date.now()}.${extension}`;
          
          // Convert base64 to binary
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // Create FormData with the file
          const formData = new FormData();
          const blob = new Blob([bytes], { type: mimeType });
          formData.append('file', blob, fileName);
          
          console.log(`Uploading image to Wix Media via multipart upload...`);
          console.log(`File name: ${fileName}, Size: ${bytes.length} bytes, Type: ${mimeType}`);
          
          const uploadResponse = await fetch(
            'https://www.wixapis.com/site-media/v1/files/upload',
            {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'wix-site-id': siteId,
                'wix-account-id': credentials.accountId || '',
              },
              body: formData
            }
          );
          
          const uploadResponseText = await uploadResponse.text();
          console.log(`Wix Media upload response status: ${uploadResponse.status}`);
          console.log(`Wix Media upload response: ${uploadResponseText}`);
          
          if (uploadResponse.ok) {
            try {
              const uploadData = JSON.parse(uploadResponseText);
              // Try various response paths for the URL
              coverImageUrl = uploadData.file?.url || 
                             uploadData.file?.fileUrl || 
                             uploadData.file?.media?.image?.url ||
                             uploadData.url ||
                             null;
              
              // If we got a file ID/key, construct the wixstatic URL
              if (!coverImageUrl && uploadData.file?.id) {
                coverImageUrl = `https://static.wixstatic.com/media/${uploadData.file.id}`;
              }
              
              if (coverImageUrl) {
                console.log(`✓ Successfully uploaded image to Wix Media. Cover URL: ${coverImageUrl}`);
              } else {
                console.log(`Warning: Upload succeeded but couldn't extract URL from response`);
              }
            } catch (parseError) {
              console.error(`Error parsing upload response: ${parseError}`);
            }
          } else {
            console.error(`Failed to upload image to Wix Media: ${uploadResponse.status}`);
          }
        }
      } else {
        // Handle external URL - use import endpoint
        console.log(`Importing image URL to Wix Media: ${post.featured_image.substring(0, 100)}...`);
        
        const mediaResponse = await fetch(
          'https://www.wixapis.com/site-media/v1/files/import',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authHeader,
              'wix-site-id': siteId,
              'wix-account-id': credentials.accountId || '',
            },
            body: JSON.stringify({
              url: post.featured_image,
              mediaType: 'IMAGE',
              displayName: `blog-cover-${Date.now()}.jpg`
            })
          }
        );
        
        const mediaResponseText = await mediaResponse.text();
        console.log(`Wix Media import response status: ${mediaResponse.status}`);
        console.log(`Wix Media import response: ${mediaResponseText}`);
        
        if (mediaResponse.ok) {
          const mediaData = JSON.parse(mediaResponseText);
          coverImageUrl = mediaData.file?.url || 
                         mediaData.file?.fileUrl || 
                         mediaData.file?.media?.image?.url ||
                         null;
          
          if (coverImageUrl) {
            console.log(`✓ Successfully imported image to Wix Media. Cover URL: ${coverImageUrl}`);
          }
        }
      }
    } catch (mediaError) {
      console.error(`Error uploading image to Wix Media Manager:`, mediaError);
    }
  }
  
  console.log("Sending data to Wix Blog API v3...");
  
  // Ensure API key has Bearer prefix
  const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
  
  // Get account ID from credentials
  const accountId = credentials.accountId;
  
  if (!accountId) {
    throw new Error("Wix Account ID is required. Please reconnect your Wix site with the correct Account ID.");
  }
  
  console.log("Using account ID:", accountId);
  
  // Step 1: Get a site member to use as post author (required for 3rd-party apps)
  console.log("Step 1: Fetching site members...");
  
  const membersResponse = await fetch(
    `https://www.wixapis.com/members/v1/members?paging.limit=1`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'wix-site-id': siteId,
        'wix-account-id': accountId,
      }
    }
  );
  
  let memberId: string | null = null;
  
  if (membersResponse.ok) {
    const membersData = await membersResponse.json();
    memberId = membersData.members?.[0]?.id;
    console.log("Found member ID:", memberId);
  } else {
    console.log("Could not fetch members, will try without memberId");
  }
  
  // Add memberId to post if available
  if (memberId) {
    (blogPost.post as any).memberId = memberId;
  }
  
  // Add coverImage if we successfully uploaded to Wix Media
  if (coverImageUrl) {
    (blogPost.post as any).coverImage = {
      src: coverImageUrl
    };
    console.log(`Added coverImage to post: ${coverImageUrl}`);
  }
  
  // Step 2: Create a draft post using Wix Blog API v3
  console.log("Step 2: Creating draft post...");
  
  const draftResponse = await fetch(
    `https://www.wixapis.com/blog/v3/draft-posts`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'wix-site-id': siteId,
        'wix-account-id': accountId,
      },
      body: JSON.stringify({ draftPost: blogPost.post })
    }
  );
  
  if (!draftResponse.ok) {
    const errorText = await draftResponse.text();
    console.error("Wix Draft API Error Response:", {
      status: draftResponse.status,
      statusText: draftResponse.statusText,
      body: errorText
    });
    
    if (draftResponse.status === 401 || draftResponse.status === 403) {
      throw new Error("Wix authentication failed - please check your API Key and permissions");
    } else if (draftResponse.status === 404) {
      throw new Error("Wix Blog API not found - ensure your site has the Wix Blog app installed");
    } else {
      throw new Error(`Wix Draft API error (${draftResponse.status}): ${errorText}`);
    }
  }
  
  const draftData = await draftResponse.json();
  const draftPostId = draftData.draftPost?.id;
  
  if (!draftPostId) {
    console.error("No draft post ID returned:", draftData);
    throw new Error("Failed to create Wix draft post - no ID returned");
  }
  
  console.log(`Draft created with ID: ${draftPostId}`);
  
  // Step 3: Publish the draft
  console.log("Step 3: Publishing draft...");
  const publishResponse = await fetch(
    `https://www.wixapis.com/blog/v3/draft-posts/${draftPostId}/publish`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'wix-site-id': siteId,
        'wix-account-id': accountId,
      }
    }
  );
  
  if (!publishResponse.ok) {
    const errorText = await publishResponse.text();
    console.error("Wix Publish API Error Response:", {
      status: publishResponse.status,
      statusText: publishResponse.statusText,
      body: errorText
    });
    throw new Error(`Wix Publish API error (${publishResponse.status}): ${errorText}`);
  }
  
  const publishData = await publishResponse.json();
  const postId = publishData.post?.id || draftPostId;
  
  console.log(`✓ Successfully published to Wix Blog! Post ID: ${postId}`);
  
  return postId;
}
