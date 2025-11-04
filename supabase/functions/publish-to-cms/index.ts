// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: any) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { blog_post_id } = await req.json();

    if (!blog_post_id) {
      throw new Error("blog_post_id is required");
    }

    console.log(`Publishing blog post ID: ${blog_post_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the blog post
    const { data: post, error: postError } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("id", blog_post_id)
      .single();

    if (postError) {
      console.error("Error fetching post:", postError);
      throw new Error(`Failed to fetch post: ${postError.message}`);
    }
    if (!post) throw new Error("Post not found");

    console.log(`Found post: ${post.title} for blog ID: ${post.blog_id}`);

    // Fetch the blog with CMS credentials
    const { data: blog, error: blogError } = await supabase
      .from("blogs")
      .select("*")
      .eq("id", post.blog_id)
      .single();

    if (blogError) {
      console.error("Error fetching blog:", blogError);
      throw new Error(`Failed to fetch blog: ${blogError.message}`);
    }
    if (!blog) throw new Error("Blog not found");

    console.log(`Found blog: ${blog.title}, CMS: ${blog.cms_platform}, URL: ${blog.cms_site_url}`);

    if (!blog.cms_platform || !blog.cms_credentials) {
      throw new Error("CMS platform or credentials not configured");
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
    console.error("Error publishing to CMS:", error);
    console.error("Error stack:", error.stack);
    
    // Try to update the post status to failed if we have the blog_post_id
    try {
      const body = await req.clone().json();
      if (body?.blog_post_id) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from("blog_posts")
          .update({
            publishing_status: "failed",
          })
          .eq("id", body.blog_post_id);
      }
    } catch (updateError) {
      console.error("Failed to update post status to failed:", updateError);
    }
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function publishToWordPress(blog: any, post: any): Promise<string> {
  console.log(`Starting WordPress publishing for post: ${post.title}`);
  
  const credentials = blog.cms_credentials;
  
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
  
  // Validate credentials with better error handling
  if (!credentials) {
    throw new Error("WordPress credentials not found in database");
  }
  
  // Handle different credential storage formats
  let username, password;
  if (typeof credentials === 'string') {
    try {
      const parsed = JSON.parse(credentials);
      username = parsed.username;
      password = parsed.password;
    } catch (e) {
      throw new Error("WordPress credentials are malformed");
    }
  } else if (typeof credentials === 'object') {
    username = credentials.username || credentials.apiKey;
    password = credentials.password || credentials.apiSecret;
  }
  
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

  // Prepare post data with meta fields
  const postData = {
    title: post.title,
    content: post.content,
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
    const credentials = blog.cms_credentials;
    if (!credentials || !credentials.access_token) {
      console.error("Missing Shopify credentials");
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

async function uploadWordPressMedia(blog: any, imageUrl: string): Promise<number | undefined> {
  const credentials = blog.cms_credentials;
  
  // Handle different credential storage formats
  let username, password;
  if (typeof credentials === 'string') {
    try {
      const parsed = JSON.parse(credentials);
      username = parsed.username;
      password = parsed.password;
    } catch (e) {
      throw new Error("WordPress credentials are malformed");
    }
  } else if (typeof credentials === 'object') {
    username = credentials.username || credentials.apiKey;
    password = credentials.password || credentials.apiSecret;
  }

  if (!username || !password) {
    throw new Error("WordPress credentials missing");
  }

  // First, fetch the image data
  console.log("Fetching image from URL:", imageUrl);
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  // Get the file extension from the URL or default to jpg
  const fileExtension = imageUrl.split('.').pop()?.toLowerCase() || 'jpg';
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

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`WordPress media upload failed (${uploadResponse.status}): ${errorText}`);
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
  const credentials = blog.cms_credentials;
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
  const credentials = blog.cms_credentials;
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
  const credentials = blog.cms_credentials;
  
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
  const credentials = blog.cms_credentials;
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
  const credentials = blog.cms_credentials;
  
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
