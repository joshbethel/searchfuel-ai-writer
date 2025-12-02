import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createResendClient, getFromEmail } from "../_shared/resend-client.ts";
import { getConfirmationEmailTemplate } from "../_shared/email-templates.ts";

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
  const normalizedOrigin = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(normalizedOrigin)) return true;
  if (normalizedOrigin.endsWith('.lovableproject.com')) return true;
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

interface ConfirmationEmailRequest {
  user_id: string;
  email: string;
  user_name?: string;
  redirect_to?: string;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle OPTIONS request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Parse request body
    const body: ConfirmationEmailRequest = await req.json();
    const { user_id, email, user_name, redirect_to } = body;

    // Validate required fields
    if (!user_id || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_id, email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase service client (admin)
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Generate confirmation link using Supabase Admin API
    const appUrl = Deno.env.get("APP_URL") || "https://app.trysearchfuel.com";
    const redirectUrl = redirect_to || `${appUrl}/plans`;
    
    // Get the user to check if they exist and are unconfirmed
    const { data: userData, error: userError } = await supabaseService.auth.admin.getUserById(user_id);
    
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "User not found", details: userError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate confirmation link - use 'signup' type for email confirmation
    const { data: linkData, error: linkError } = await supabaseService.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: redirectUrl,
      }
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Error generating confirmation link:", linkError);
      return new Response(
        JSON.stringify({ 
          error: "Failed to generate confirmation link", 
          details: linkError?.message 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use the action_link from Supabase which contains the confirmation token
    const confirmationUrl = linkData.properties.action_link;

    // Initialize Resend client
    const resend = createResendClient();
    const fromEmail = getFromEmail();

    // Generate confirmation email HTML
    const confirmationHtml = getConfirmationEmailTemplate({
      userEmail: email,
      userName: user_name,
      confirmationUrl: confirmationUrl
    });

    console.log(`[Confirmation Email] From: ${fromEmail}, To: ${email}`);
    const emailResult = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: "Confirm your email - SearchFuel",
      html: confirmationHtml,
    });

    if (emailResult.error) {
      throw new Error(emailResult.error.message || "Failed to send confirmation email");
    }

    console.log(`Confirmation email sent successfully to ${email}`);

    return new Response(JSON.stringify({
      success: true,
      message: "Confirmation email sent successfully"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Error in send-confirmation-email function:", error);
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

