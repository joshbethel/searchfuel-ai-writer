import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createResendClient, getFromEmail, getInternalNotificationEmails } from "../_shared/resend-client.ts";
import { getWelcomeEmailTemplate, getInternalNotificationTemplate } from "../_shared/email-templates.ts";

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

interface NotificationRequest {
  user_id: string;
  email: string;
  created_at: string;
  user_name?: string;
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
    // Check if notifications are enabled (feature flag)
    const notificationsEnabled = Deno.env.get("ENABLE_ACCOUNT_NOTIFICATIONS") !== "false";
    if (!notificationsEnabled) {
      console.log("Account notifications are disabled via feature flag");
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Notifications disabled" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Parse request body
    const body: NotificationRequest = await req.json();
    const { user_id, email, created_at, user_name } = body;

    // Validate required fields
    if (!user_id || !email || !created_at) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_id, email, created_at" }),
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

    // Initialize Resend client
    const resend = createResendClient();
    const fromEmail = getFromEmail();
    const internalEmails = getInternalNotificationEmails();

    // Initialize Supabase service client for optional stats
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Optional: Get user statistics (non-blocking)
    // Note: We can't directly query auth.users table, so we'll skip stats for now
    // This can be enhanced later with a custom database function if needed
    let totalUsers: number | undefined;
    let dailySignups: number | undefined;
    
    // Statistics are optional - leaving undefined for now
    // Can be enhanced later with a database function that queries auth.users

    const results = {
      welcomeEmail: { success: false, error: null as string | null },
      internalNotification: { success: false, error: null as string | null }
    };

    // Send welcome email to user
    try {
      const welcomeHtml = getWelcomeEmailTemplate({
        userEmail: email,
        userName: user_name,
        signupDate: created_at
      });

      console.log(`[Welcome Email] From: ${fromEmail}, To: ${email}`);
      const welcomeResult = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: "Welcome to SearchFuel! 🚀",
        html: welcomeHtml,
      });

      if (welcomeResult.error) {
        throw new Error(welcomeResult.error.message || "Failed to send welcome email");
      }

      results.welcomeEmail.success = true;
      console.log(`Welcome email sent successfully to ${email}`);
    } catch (welcomeError) {
      const errorMessage = welcomeError instanceof Error ? welcomeError.message : "Unknown error";
      results.welcomeEmail.error = errorMessage;
      console.error(`Failed to send welcome email to ${email}:`, errorMessage);
      // Don't throw - continue with internal notification
    }

    // Send internal notification to team
    try {
      const internalHtml = getInternalNotificationTemplate({
        userEmail: email,
        userId: user_id,
        signupDate: created_at,
        totalUsers,
        dailySignups
      });

      console.log(`[Internal Notification] From: ${fromEmail}, To: ${internalEmails.join(", ")}`);
      const internalResult = await resend.emails.send({
        from: fromEmail,
        to: internalEmails,
        subject: `🎉 New SearchFuel Signup: ${email}`,
        html: internalHtml,
      });

      if (internalResult.error) {
        throw new Error(internalResult.error.message || "Failed to send internal notification");
      }

      results.internalNotification.success = true;
      console.log(`Internal notification sent successfully to ${internalEmails.join(", ")}`);
    } catch (internalError) {
      const errorMessage = internalError instanceof Error ? internalError.message : "Unknown error";
      results.internalNotification.error = errorMessage;
      console.error(`Failed to send internal notification:`, errorMessage);
      // Don't throw - at least we tried
    }

    // Return success even if some emails failed (non-blocking)
    const allSuccess = results.welcomeEmail.success && results.internalNotification.success;
    const anySuccess = results.welcomeEmail.success || results.internalNotification.success;

    return new Response(JSON.stringify({
      success: anySuccess,
      welcomeEmail: results.welcomeEmail,
      internalNotification: results.internalNotification,
      message: allSuccess 
        ? "All notifications sent successfully" 
        : anySuccess 
        ? "Some notifications sent (check errors)" 
        : "Failed to send notifications (check errors)"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: anySuccess ? 200 : 500,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Error in send-account-notifications function:", error);
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

