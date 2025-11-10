import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// CORS handling
const allowedOrigins = [
  "https://searchfuel-ai-writer.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(origin: string | null) {
  const isAllowed = origin && allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

  // Get user's Stripe customer ID
  const { data: subscription } = await supabaseClient
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', data.user.id)
    .single();

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

  // Create portal session
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${origin || 'https://searchfuel-ai-writer.lovable.app'}/settings?tab=subscription`,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});

