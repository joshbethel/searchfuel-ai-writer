import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// CORS handling with allowed origins
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
  
  // Allow Lovable preview domains (*.lovableproject.com and *.lovable.app)
  if (normalizedOrigin.endsWith('.lovableproject.com')) return true;
  if (normalizedOrigin.endsWith('.lovable.app')) return true;
  
  return false;
}

function getCorsHeaders(origin: string | null) {
  const isAllowed = isOriginAllowed(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  // Parse request body for quantity (must be done before authentication to avoid consuming body)
  let quantity = 1;
  try {
    const body = await req.json();
    if (body && typeof body.quantity === 'number' && body.quantity > 0) {
      quantity = Math.floor(body.quantity);
      // Cap quantity at 5 sites per account
      if (quantity > 5) quantity = 5;
      console.log(`Quantity requested: ${quantity}`);
    }
  } catch (e) {
    // If body parsing fails or body is empty, use default quantity of 1
    console.log("No quantity provided or body parsing failed, using default: 1");
  }

  // User authentication
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  console.log("Checking authentication...");
  const authHeader = req.headers.get("Authorization");
  console.log("Authorization header present:", !!authHeader);
  
  if (!authHeader) {
    console.error("No authorization header found in request");
    // Log headers without sensitive information
    const headers: Record<string, string> = {};
    for (const [key, value] of req.headers.entries()) {
      if (key.toLowerCase() === 'authorization') {
        headers[key] = '[REDACTED]';
      } else {
        headers[key] = value;
      }
    }
    console.log("Request headers (authorization redacted):", headers);
    return new Response(
      JSON.stringify({ error: "No authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.replace("Bearer ", "");
  console.log("Token extracted, length:", token.length);
  
  const { data, error: authError } = await supabaseClient.auth.getUser(token);
  
  if (authError) {
    console.error("Authentication error:", authError.message);
    return new Response(
      JSON.stringify({ error: "Unauthorized", details: authError.message }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  if (!data.user?.email) {
    console.error("No user email found after authentication");
    return new Response(
      JSON.stringify({ error: "Unauthorized", details: "User email not found" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const user = data.user;
  console.log("User authenticated successfully:", user.id, user.email);

  // Stripe initialization with mode-based config
  const stripeMode = Deno.env.get("STRIPE_MODE") || "test";
  const stripeKey = stripeMode === "live" 
    ? Deno.env.get("STRIPE_SECRET_KEY") || ""
    : Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";
  const priceId = stripeMode === "live"
    ? Deno.env.get("STRIPE_PRICE_LIVE") || ""
    : Deno.env.get("STRIPE_PRICE_TEST") || "";

  if (!stripeKey || !priceId) {
    return new Response(
      JSON.stringify({ error: "Stripe configuration missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2025-10-29.clover",
  });

  // Get or create Stripe customer
  const supabaseService = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: subscription } = await supabaseService
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  let customerId = subscription?.stripe_customer_id;
  
  if (!customerId) {
    // Check Stripe for existing customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      // Update or create subscription record
      await supabaseService
        .from('subscriptions')
        .upsert({
          user_id: user.id,
          stripe_customer_id: customerId,
          sites_allowed: quantity, // Set sites based on quantity
        }, {
          onConflict: 'user_id'
        });
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          user_id: user.id,
        },
      });
      customerId = customer.id;
      
      // Create subscription record
      await supabaseService
        .from('subscriptions')
        .upsert({
          user_id: user.id,
          stripe_customer_id: customerId,
          sites_allowed: quantity, // Set sites based on quantity
        }, {
          onConflict: 'user_id'
        });
    }
  }

  // Create checkout session for subscription
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: quantity,
      },
    ],
    mode: "subscription",
    success_url: `${origin || 'https://searchfuel-ai-writer.lovable.app'}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin || 'https://searchfuel-ai-writer.lovable.app'}/settings?tab=subscription&canceled=true`,
    metadata: {
      user_id: user.id,
      user_email: user.email,
      quantity: quantity.toString(), // Store quantity in metadata for reference
    },
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
  
  } catch (error) {
    console.error("Error in create-checkout-session:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

