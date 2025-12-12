import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";

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

interface ManageAdminRoleRequest {
  action: 'grant' | 'revoke';
  target_user_id: string;
  reason?: string; // Optional reason for the action (for audit logging)
}

interface AuditLogDetails {
  action: string;
  previous_admin_status: boolean;
  new_admin_status: boolean;
  reason?: string;
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
  details: AuditLogDetails
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

// Helper function to get user email
async function getUserEmail(supabaseService: any, userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseService.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) {
      console.error('Failed to get user email:', error);
      return null;
    }
    return data.user.email;
  } catch (error) {
    console.error('Error getting user email:', error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeadersWithOrigin(req.headers.get("origin")),
    });
  }

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeadersWithOrigin(origin);

  try {
    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role key
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify the user is authenticated
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: adminUser }, error: authError } = await supabaseService.auth.getUser(token);

    if (authError || !adminUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the user is an admin
    const userIsAdmin = await isAdminUser(supabaseService, adminUser.id);
    if (!userIsAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: ManageAdminRoleRequest = await req.json();
    const { action, target_user_id, reason } = body;

    if (!action || !target_user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: action and target_user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action !== 'grant' && action !== 'revoke') {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'grant' or 'revoke'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent self-revocation (admins shouldn't be able to revoke their own admin access)
    if (action === 'revoke' && target_user_id === adminUser.id) {
      return new Response(
        JSON.stringify({ error: "Cannot revoke your own admin access" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if target user exists
    const { data: targetUserData, error: targetUserError } = await supabaseService.auth.admin.getUserById(target_user_id);
    if (targetUserError || !targetUserData?.user) {
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check current admin status
    const currentlyAdmin = await isAdminUser(supabaseService, target_user_id);

    // Prepare audit log details
    const auditDetails: AuditLogDetails = {
      action: action === 'grant' ? 'grant_admin_role' : 'revoke_admin_role',
      previous_admin_status: currentlyAdmin,
      new_admin_status: action === 'grant',
      reason: reason?.trim() || undefined,
    };

    if (action === 'grant') {
      // Grant admin role
      if (currentlyAdmin) {
        return new Response(
          JSON.stringify({ error: "User is already an admin" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use the add_admin_user function to grant admin access
      const { error: grantError } = await supabaseService.rpc('add_admin_user', {
        target_user_id: target_user_id,
        admin_user_id: adminUser.id,
      });

      if (grantError) {
        console.error('Failed to grant admin role:', grantError);
        return new Response(
          JSON.stringify({ error: "Failed to grant admin role", details: grantError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log the action
      await logAdminAction(supabaseService, adminUser.id, 'grant_admin_role', target_user_id, auditDetails);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Admin role granted successfully",
          target_user_id: target_user_id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Revoke admin role
      if (!currentlyAdmin) {
        return new Response(
          JSON.stringify({ error: "User is not an admin" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete from admin_users table
      const { error: revokeError } = await supabaseService
        .from('admin_users')
        .delete()
        .eq('user_id', target_user_id);

      if (revokeError) {
        console.error('Failed to revoke admin role:', revokeError);
        return new Response(
          JSON.stringify({ error: "Failed to revoke admin role", details: revokeError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log the action
      await logAdminAction(supabaseService, adminUser.id, 'revoke_admin_role', target_user_id, auditDetails);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Admin role revoked successfully",
          target_user_id: target_user_id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("Error managing admin role:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
