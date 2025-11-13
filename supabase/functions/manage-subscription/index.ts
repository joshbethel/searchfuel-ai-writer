import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
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
  
  // Normalize origin by removing trailing slash
  const normalizedOrigin = origin.replace(/\/$/, '');
  
  // Check exact matches
  if (allowedOrigins.includes(normalizedOrigin)) return true;
  
  // Allow Lovable preview domains (*.lovableproject.com)
  if (normalizedOrigin.endsWith('.lovableproject.com')) return true;
  
  return false;
}

function getCorsHeaders(origin: string | null) {
  const isAllowed = isOriginAllowed(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    // User authentication
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

    const token = authHeader.replace("Bearer ", "");
    const { data, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !data.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role key to query subscriptions (bypasses RLS, but we've already authenticated the user)
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get user's Stripe customer ID
    const { data: subscription, error: subscriptionError } = await supabaseService
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (subscriptionError) {
      console.error('Error fetching subscription:', subscriptionError);
      return new Response(
        JSON.stringify({ error: "Error fetching subscription" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subscription?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: "No subscription found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Stripe
    const stripeMode = Deno.env.get("STRIPE_MODE") || "test";
    const stripeKey = stripeMode === "live" 
      ? Deno.env.get("STRIPE_SECRET_KEY") || ""
      : Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";

    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

    // Get optional portal configuration ID from environment
    // Default to the test configuration if not set in environment
    const portalConfigId = stripeMode === "live"
      ? Deno.env.get("STRIPE_PORTAL_CONFIGURATION_ID_LIVE")
      : Deno.env.get("STRIPE_PORTAL_CONFIGURATION_ID_TEST");

    // Create portal session
    const portalSessionParams: {
      customer: string;
      return_url: string;
      configuration?: string;
    } = {
      customer: subscription.stripe_customer_id,
      return_url: `${origin || 'https://searchfuel-ai-writer.lovable.app'}/settings?tab=subscription`,
    };

    // Add configuration if provided
    if (portalConfigId) {
      portalSessionParams.configuration = portalConfigId;
    }

    const session = await stripe.billingPortal.sessions.create(portalSessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in manage-subscription:", error);
    
    // Handle Stripe-specific errors
    let errorMessage = "Internal server error";
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Check if it's a Stripe portal configuration error
      const errorWithType = error as Error & { type?: string };
      const isPortalConfigError = 
        error.message.includes("No configuration provided") || 
        error.message.includes("default configuration has not been created") ||
        (errorWithType.type === "StripeInvalidRequestError" && 
        error.message.includes("configuration"));
      
      if (isPortalConfigError) {
        errorMessage = "Billing portal is not configured. Please set up the customer portal in your Stripe dashboard at https://dashboard.stripe.com/test/settings/billing/portal (for test mode) or https://dashboard.stripe.com/settings/billing/portal (for live mode).";
        statusCode = 400;
      }
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

