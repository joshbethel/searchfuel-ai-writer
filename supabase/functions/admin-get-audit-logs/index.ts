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

interface GetAuditLogsRequest {
  filters?: {
    action_type?: string;
    admin_user_id?: string;
    target_user_id?: string;
    start_date?: string;
    end_date?: string;
  };
  limit?: number;
  offset?: number;
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
    const body: GetAuditLogsRequest = await req.json();
    const { filters = {}, limit = 100, offset = 0 } = body;

    // Build query
    let query = supabaseService
      .from('admin_actions')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (filters.action_type) {
      query = query.eq('action_type', filters.action_type);
    }
    if (filters.admin_user_id) {
      query = query.eq('admin_user_id', filters.admin_user_id);
    }
    if (filters.target_user_id) {
      query = query.eq('target_user_id', filters.target_user_id);
    }
    if (filters.start_date) {
      query = query.gte('created_at', filters.start_date);
    }
    if (filters.end_date) {
      query = query.lte('created_at', filters.end_date);
    }

    const { data: auditLogs, error: logsError } = await query;

    if (logsError) {
      console.error('Error fetching audit logs:', logsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch audit logs", details: logsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique user IDs (admin and target users)
    const userIds = new Set<string>();
    (auditLogs || []).forEach((log: any) => {
      userIds.add(log.admin_user_id);
      userIds.add(log.target_user_id);
    });

    // Fetch user information
    const userInfoMap = new Map();
    if (userIds.size > 0) {
      const { data: allUsers, error: usersError } = await supabaseService.auth.admin.listUsers();
      
      if (!usersError && allUsers?.users) {
        allUsers.users.forEach((user: any) => {
          if (userIds.has(user.id)) {
            userInfoMap.set(user.id, {
              email: user.email,
              name: user.user_metadata?.name || user.user_metadata?.full_name || null,
            });
          }
        });
      }
    }

    // Enrich audit logs with user information
    const enrichedLogs = (auditLogs || []).map((log: any) => {
      const adminInfo = userInfoMap.get(log.admin_user_id);
      const targetInfo = userInfoMap.get(log.target_user_id);

      return {
        ...log,
        admin_email: adminInfo?.email || null,
        admin_name: adminInfo?.name || null,
        target_email: targetInfo?.email || null,
        target_name: targetInfo?.name || null,
      };
    });

    // Get total count for pagination
    let countQuery = supabaseService
      .from('admin_actions')
      .select('*', { count: 'exact', head: true });

    if (filters.action_type) {
      countQuery = countQuery.eq('action_type', filters.action_type);
    }
    if (filters.admin_user_id) {
      countQuery = countQuery.eq('admin_user_id', filters.admin_user_id);
    }
    if (filters.target_user_id) {
      countQuery = countQuery.eq('target_user_id', filters.target_user_id);
    }
    if (filters.start_date) {
      countQuery = countQuery.gte('created_at', filters.start_date);
    }
    if (filters.end_date) {
      countQuery = countQuery.lte('created_at', filters.end_date);
    }

    const { count, error: countError } = await countQuery;

    return new Response(JSON.stringify({
      success: true,
      logs: enrichedLogs,
      total: count || 0,
      limit,
      offset,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in admin-get-audit-logs:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...getCorsHeadersWithOrigin(null), "Content-Type": "application/json" } }
    );
  }
});

