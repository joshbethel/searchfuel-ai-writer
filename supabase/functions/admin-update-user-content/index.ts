import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// CORS handling
const allowedOrigins = [
  "https://searchfuel-ai-writer.lovable.app",
  "https://preview--searchfuel-ai-writer.lovable.app",
  "https://ef7316e9-181c-4379-9b43-1c52f85bdf75.lovableproject.com",
  "https://app.trysearchfuel.com",
  "https://lovable.dev",
  "http://localhost:5173",
  "http://localhost:3000",
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  const normalizedOrigin = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(normalizedOrigin)) return true;
  if (normalizedOrigin.endsWith('.lovableproject.com')) return true;
  if (normalizedOrigin.endsWith('.lovable.app')) return true;
  return false;
}

function getCorsHeadersWithOrigin(origin: string | null) {
  const isAllowed = isOriginAllowed(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
}

interface UpdateUserContentRequest {
  target_user_id: string;
  content_type: 'blogs' | 'blog_posts' | 'articles' | 'keywords';
  content_id: string;
  updates: Record<string, any>;
  reason?: string;
}

interface EditContentAuditDetails {
  content_type: string;
  content_id: string;
  previous_values: Record<string, any>;
  new_values: Record<string, any>;
  reason?: string;
  fields_changed: string[];
}

// Helper function to check if user is admin
async function isAdminUser(supabaseService: any, userId: string): Promise<boolean> {
  const { data, error } = await supabaseService
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    return false;
  }
  return true;
}

// Helper function to log admin action
async function logAdminAction(
  supabaseService: any,
  adminUserId: string,
  actionType: string,
  targetUserId: string,
  details: EditContentAuditDetails
) {
  try {
    await supabaseService
      .from('admin_actions')
      .insert({
        admin_user_id: adminUserId,
        action_type: actionType,
        target_user_id: targetUserId,
        details: details,
      });
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Don't throw - audit logging failure shouldn't break the operation
  }
}

// Helper function to get table name from content type
function getTableName(contentType: string): string {
  const tableMap: Record<string, string> = {
    'blogs': 'blogs',
    'blog_posts': 'blog_posts',
    'articles': 'articles',
    'keywords': 'keywords',
  };
  return tableMap[contentType] || contentType;
}

// Helper function to get user_id field name
function getUserIdField(contentType: string): string {
  if (contentType === 'blog_posts') {
    // blog_posts doesn't have user_id directly, need to check via blogs table
    return 'blog_id';
  }
  return 'user_id';
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeadersWithOrigin(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Initialize Supabase clients
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Authenticate admin user
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

    const adminUserId = authData.user.id;

    // Check if user is admin
    const isAdmin = await isAdminUser(supabaseService, adminUserId);
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: UpdateUserContentRequest = await req.json();
    const { target_user_id, content_type, content_id, updates, reason } = body;

    if (!target_user_id || !content_type || !content_id || !updates) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: target_user_id, content_type, content_id, updates" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify target user exists
    const { data: targetUser, error: targetUserError } = await supabaseService.auth.admin.getUserById(target_user_id);
    if (targetUserError || !targetUser?.user) {
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tableName = getTableName(content_type);
    const userIdField = getUserIdField(content_type);

    // Fetch current content to get previous values and verify ownership
    let currentContent: any = null;
    let fetchError: any = null;
    
    if (content_type === 'blog_posts') {
      // For blog_posts, first get the post
      const { data: post, error: postError } = await supabaseService
        .from('blog_posts')
        .select('*')
        .eq('id', content_id)
        .single();

      if (postError || !post) {
        fetchError = postError || new Error('Post not found');
      } else {
        // Then verify the blog belongs to the target user
        const { data: blog, error: blogError } = await supabaseService
          .from('blogs')
          .select('id, user_id')
          .eq('id', post.blog_id)
          .eq('user_id', target_user_id)
          .single();

        if (blogError || !blog) {
          fetchError = new Error('Blog post does not belong to target user');
        } else {
          currentContent = post;
        }
      }
    } else {
      const { data, error } = await supabaseService
        .from(tableName)
        .select('*')
        .eq('id', content_id)
        .eq(userIdField, target_user_id)
        .single();
      
      currentContent = data;
      fetchError = error;
    }

    if (fetchError || !currentContent) {
      return new Response(
        JSON.stringify({ error: "Content not found or does not belong to target user" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store previous values
    const previousValues = { ...currentContent };

    // Determine which fields changed
    const fieldsChanged: string[] = [];
    Object.keys(updates).forEach(key => {
      if (JSON.stringify(previousValues[key]) !== JSON.stringify(updates[key])) {
        fieldsChanged.push(key);
      }
    });

    if (fieldsChanged.length === 0) {
      return new Response(
        JSON.stringify({ error: "No changes detected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare update object (exclude id, created_at, updated_at from updates)
    const updateData: Record<string, any> = {};
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        updateData[key] = updates[key];
      }
    });

    // Update content
    const { data: updatedContent, error: updateError } = await supabaseService
      .from(tableName)
      .update(updateData)
      .eq('id', content_id)
      .select()
      .single();

    if (updateError || !updatedContent) {
      console.error('Error updating content:', updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update content", details: updateError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare new values for audit log (only changed fields)
    const newValues: Record<string, any> = {};
    fieldsChanged.forEach(field => {
      newValues[field] = updatedContent[field];
    });

    // Log edit action
    await logAdminAction(supabaseService, adminUserId, 'edit_content', target_user_id, {
      content_type: content_type,
      content_id: content_id,
      previous_values: Object.fromEntries(
        fieldsChanged.map(field => [field, previousValues[field]])
      ),
      new_values: newValues,
      reason: reason?.trim() || undefined,
      fields_changed: fieldsChanged,
    });

    return new Response(JSON.stringify({
      success: true,
      content: updatedContent,
      previous_values: Object.fromEntries(
        fieldsChanged.map(field => [field, previousValues[field]])
      ),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in admin-update-user-content:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...getCorsHeadersWithOrigin(null), "Content-Type": "application/json" } }
    );
  }
});

