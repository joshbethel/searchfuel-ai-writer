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
    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Search query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchQuery = query.trim().toLowerCase();

    // Search users using admin API
    const { data: allUsers, error: usersError } = await supabaseService.auth.admin.listUsers();

    if (usersError) {
      console.error('Error listing users:', usersError);
      return new Response(
        JSON.stringify({ error: "Failed to search users", details: usersError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter users by search query (email, name, or user ID)
    const matchingUsers = (allUsers?.users || []).filter((user: any) => {
      const email = (user.email || '').toLowerCase();
      const name = (user.user_metadata?.name || user.user_metadata?.full_name || '').toLowerCase();
      const userId = user.id.toLowerCase();
      
      return email.includes(searchQuery) || name.includes(searchQuery) || userId.includes(searchQuery);
    }).slice(0, 50); // Limit to 50 results

    // Get subscriptions for matching users
    const userIds = matchingUsers.map((u: any) => u.id);
    const { data: subscriptions } = await supabaseService
      .from('subscriptions')
      .select('user_id, id, status, plan_name, current_period_end, is_manual, stripe_subscription_id')
      .in('user_id', userIds);

    // Create a map of user_id -> subscription
    const subscriptionMap = new Map();
    (subscriptions || []).forEach((sub: any) => {
      subscriptionMap.set(sub.user_id, sub);
    });

    // Combine user data with subscription data
    const results = matchingUsers.map((user: any) => ({
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
      subscription: subscriptionMap.get(user.id) || null,
    }));

    return new Response(JSON.stringify({
      success: true,
      users: results,
      count: results.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in admin-search-users:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...getCorsHeaders(null), "Content-Type": "application/json" } }
    );
  }
});
