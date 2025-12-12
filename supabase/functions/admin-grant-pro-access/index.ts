import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { createResendClient, getFromEmail } from "../_shared/resend-client.ts";
import { sendEmailWithRetry } from "../_shared/resend-retry.ts";
import { getProAccessGrantedEmailTemplate, getProAccessRevokedEmailTemplate } from "../_shared/email-templates.ts";

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

interface GrantProAccessRequest {
  action: 'grant' | 'revoke' | 'update_period_end' | 'update_sites';
  target_user_id: string;
  current_period_end?: string; // ISO timestamp, optional for grant, required for update
  sites_allowed?: number; // Number of websites user can manage
  reason?: string; // Optional reason for the action (for audit logging)
}

interface AuditLogDetails {
  action: string;
  subscription_id?: string;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  previous_status?: string;
  new_status?: string;
  previous_plan?: string;
  new_plan?: string;
  is_manual: boolean;
  reason?: string;
  billing_period?: string;
  period_start?: string;
  period_end?: string;
  previous_period_end?: string;
  custom_period_end_set?: boolean;
  previous_sites_allowed?: number;
  new_sites_allowed?: number;
  email_notification?: {
    sent: boolean;
    sent_at?: string;
    error?: string | null;
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
    const body: GrantProAccessRequest = await req.json();
    const { action, target_user_id, current_period_end, sites_allowed, reason } = body;

    if (!action || !target_user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: action, target_user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!['grant', 'revoke', 'update_period_end', 'update_sites'].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'grant', 'revoke', 'update_period_end', or 'update_sites'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get target user info
    const { data: targetUser, error: targetUserError } = await supabaseService.auth.admin.getUserById(target_user_id);
    if (targetUserError || !targetUser?.user) {
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetUserEmail = targetUser.user.email;

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
      apiVersion: "2025-10-29.clover",
    });

    // Get Pro price ID
    const proPriceId = stripeMode === "live"
      ? Deno.env.get("STRIPE_PRICE_LIVE")
      : Deno.env.get("STRIPE_PRICE_TEST");

    if (!proPriceId) {
      return new Response(
        JSON.stringify({ error: "Stripe Pro price ID not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing subscription
    const { data: existingSubscription } = await supabaseService
      .from('subscriptions')
      .select('*')
      .eq('user_id', target_user_id)
      .single();

    let auditDetails: AuditLogDetails = {
      action: action,
      is_manual: true,
      reason: reason,
    };

    // Handle different actions
    if (action === 'grant') {
      // GRANT PRO ACCESS
      // Validate sites_allowed
      const finalSitesAllowed = sites_allowed !== undefined ? sites_allowed : 1;
      if (finalSitesAllowed < 1 || finalSitesAllowed > 5) {
        return new Response(
          JSON.stringify({ error: "sites_allowed must be between 1 and 5" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const periodEndDate = current_period_end 
        ? new Date(current_period_end)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default: 30 days from now

      if (isNaN(periodEndDate.getTime())) {
        return new Response(
          JSON.stringify({ error: "Invalid current_period_end date" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get or create Stripe customer
      let customerId = existingSubscription?.stripe_customer_id;
      if (!customerId) {
        // Check if customer exists in Stripe
        const customers = await stripe.customers.list({ email: targetUserEmail || '', limit: 1 });
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
        } else {
          // Create new Stripe customer
          const customer = await stripe.customers.create({
            email: targetUserEmail || undefined,
            metadata: {
              user_id: target_user_id,
            },
          });
          customerId = customer.id;
        }
      }


      // Calculate days until due (difference between now and period end)
      const now = new Date();
      const daysUntilDue = Math.ceil((periodEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Create or update Stripe subscription
      let stripeSubscription;
      const hasActiveStripeSubscription = existingSubscription?.stripe_subscription_id && 
                                          existingSubscription?.status !== 'canceled';
      
      if (hasActiveStripeSubscription) {
        try {
          // Try to update existing active subscription
          stripeSubscription = await stripe.subscriptions.update(
            existingSubscription.stripe_subscription_id,
            {
              items: [{
                price: proPriceId,
                quantity: finalSitesAllowed, // Set quantity to match sites_allowed
              }],
              metadata: {
                is_manual: 'true',
                granted_by_admin: adminUserId,
              },
              cancel_at: Math.floor(periodEndDate.getTime() / 1000),
              collection_method: 'send_invoice',
              days_until_due: Math.max(1, daysUntilDue), // Ensure at least 1 day
            }
          );
        } catch (updateError: any) {
          // If update fails (e.g., subscription is canceled), create a new one
          console.log('Failed to update existing subscription, creating new one:', updateError.message);
          stripeSubscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{
              price: proPriceId,
              quantity: finalSitesAllowed, // Set quantity to match sites_allowed
            }],
            metadata: {
              is_manual: 'true',
              granted_by_admin: adminUserId,
            },
            cancel_at: Math.floor(periodEndDate.getTime() / 1000),
            collection_method: 'send_invoice',
            days_until_due: Math.max(1, daysUntilDue), // Ensure at least 1 day
          });
        }
      } else {
        // Create new subscription with send_invoice collection method
        // This allows subscriptions without payment methods for manual grants
        // Also used when existing subscription is canceled
        stripeSubscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [{
            price: proPriceId,
            quantity: finalSitesAllowed, // Set quantity to match sites_allowed
          }],
          metadata: {
            is_manual: 'true',
            granted_by_admin: adminUserId,
          },
          cancel_at: Math.floor(periodEndDate.getTime() / 1000),
          collection_method: 'send_invoice',
          days_until_due: Math.max(1, daysUntilDue), // Ensure at least 1 day
        });
      }

      // Update database subscription
      const periodStart = new Date();
      const periodEnd = periodEndDate;

      // First, try to delete any existing subscription with the same stripe_customer_id but different user_id
      // This handles the case where a user was deleted and recreated
      const { error: deleteConflictError } = await supabaseService
        .from('subscriptions')
        .delete()
        .eq('stripe_customer_id', customerId)
        .neq('user_id', target_user_id);

      if (deleteConflictError) {
        console.warn('Warning: Could not clean up conflicting subscriptions:', deleteConflictError);
        // Continue anyway, the upsert might still work
      }

      // Now update or insert the subscription
      // Use explicit update/insert to ensure sites_allowed is always set correctly
      let finalSubscription;
      
      if (existingSubscription) {
        // Update existing subscription
        console.log('Updating existing subscription. Current sites_allowed:', existingSubscription.sites_allowed, 'New:', finalSitesAllowed);
        const { data: updatedSubscription, error: updateError } = await supabaseService
          .from('subscriptions')
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: stripeSubscription.id,
            stripe_price_id: proPriceId,
            status: 'active',
            plan_name: 'pro',
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            is_manual: true,
            sites_allowed: finalSitesAllowed,
          })
          .eq('user_id', target_user_id)
          .select()
          .single();
        
        if (updateError) {
          console.error('Failed to update subscription:', updateError);
          return new Response(
            JSON.stringify({ error: "Failed to update subscription", details: updateError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        console.log('Subscription updated successfully. sites_allowed:', updatedSubscription?.sites_allowed);
        finalSubscription = updatedSubscription;
      } else {
        // Insert new subscription
        console.log('Inserting new subscription with sites_allowed:', finalSitesAllowed);
        const { data: insertedSubscription, error: insertError } = await supabaseService
          .from('subscriptions')
          .insert({
            user_id: target_user_id,
            stripe_customer_id: customerId,
            stripe_subscription_id: stripeSubscription.id,
            stripe_price_id: proPriceId,
            status: 'active',
            plan_name: 'pro',
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            is_manual: true,
            sites_allowed: finalSitesAllowed,
          })
          .select()
          .single();
        
        if (insertError) {
          console.error('Failed to insert subscription:', insertError);
          return new Response(
            JSON.stringify({ error: "Failed to create subscription", details: insertError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        console.log('Subscription inserted successfully. sites_allowed:', insertedSubscription?.sites_allowed);
        finalSubscription = insertedSubscription;
      }

      auditDetails = {
        ...auditDetails,
        subscription_id: finalSubscription?.id,
        stripe_subscription_id: stripeSubscription.id,
        stripe_customer_id: customerId,
        previous_status: existingSubscription?.status || 'inactive',
        new_status: 'active',
        previous_plan: existingSubscription?.plan_name || 'free',
        new_plan: 'pro',
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        custom_period_end_set: !!current_period_end,
      };

      // Send email notification (non-blocking)
      let emailStatus = { sent: false, sent_at: undefined as string | undefined, error: null as string | null };
      if (targetUserEmail) {
        try {
          const resend = createResendClient();
          const fromEmail = getFromEmail();
          
          // Calculate remaining days
          const now = new Date();
          const remainingDays = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          const emailHtml = getProAccessGrantedEmailTemplate({
            userEmail: targetUserEmail,
            userName: targetUser.user.user_metadata?.name || targetUser.user.user_metadata?.full_name,
            periodEnd: periodEnd.toISOString(),
            remainingDays: remainingDays > 0 ? remainingDays : 0,
          });

          await sendEmailWithRetry(resend, {
            from: fromEmail,
            to: targetUserEmail,
            subject: "Your SearchFuel Pro Access Has Been Activated 🎉",
            html: emailHtml,
          });

          emailStatus = { sent: true, sent_at: new Date().toISOString(), error: null };
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
          emailStatus = { sent: false, sent_at: undefined, error: emailError instanceof Error ? emailError.message : 'Unknown error' };
        }
      }

      auditDetails.email_notification = emailStatus;

      // Log admin action
      await logAdminAction(supabaseService, adminUserId, 'grant_pro_access', target_user_id, auditDetails);

      return new Response(JSON.stringify({
        success: true,
        message: "Pro access granted successfully",
        subscription: finalSubscription,
        email_sent: emailStatus.sent,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else if (action === 'revoke') {
      // REVOKE PRO ACCESS
      if (!existingSubscription) {
        return new Response(
          JSON.stringify({ error: "No subscription found for this user" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if subscription is manual (can only revoke manual subscriptions)
      if (!existingSubscription.is_manual) {
        return new Response(
          JSON.stringify({ error: "Cannot revoke paid subscription. Only manual subscriptions can be revoked." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Cancel Stripe subscription if it exists
      if (existingSubscription.stripe_subscription_id) {
        try {
          await stripe.subscriptions.cancel(existingSubscription.stripe_subscription_id);
        } catch (stripeError) {
          console.error('Failed to cancel Stripe subscription:', stripeError);
          // Continue anyway - we'll still update the database
        }
      }

      // Update database subscription
      const { data: updatedSubscription, error: updateError } = await supabaseService
        .from('subscriptions')
        .update({
          status: 'canceled',
          plan_name: 'free',
          canceled_at: new Date().toISOString(),
        })
        .eq('user_id', target_user_id)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update subscription:', updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update subscription", details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      auditDetails = {
        ...auditDetails,
        subscription_id: existingSubscription.id,
        stripe_subscription_id: existingSubscription.stripe_subscription_id || undefined,
        stripe_customer_id: existingSubscription.stripe_customer_id || undefined,
        previous_status: existingSubscription.status,
        new_status: 'canceled',
        previous_plan: existingSubscription.plan_name,
        new_plan: 'free',
      };

      // Send email notification (non-blocking)
      let emailStatus = { sent: false, sent_at: undefined as string | undefined, error: null as string | null };
      if (targetUserEmail) {
        try {
          const resend = createResendClient();
          const fromEmail = getFromEmail();
          
          const emailHtml = getProAccessRevokedEmailTemplate({
            userEmail: targetUserEmail,
            userName: targetUser.user.user_metadata?.name || targetUser.user.user_metadata?.full_name,
          });

          await sendEmailWithRetry(resend, {
            from: fromEmail,
            to: targetUserEmail,
            subject: "Your SearchFuel Pro Access Has Been Removed",
            html: emailHtml,
          });

          emailStatus = { sent: true, sent_at: new Date().toISOString(), error: null };
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
          emailStatus = { sent: false, sent_at: undefined, error: emailError instanceof Error ? emailError.message : 'Unknown error' };
        }
      }

      auditDetails.email_notification = emailStatus;

      // Log admin action
      await logAdminAction(supabaseService, adminUserId, 'revoke_pro_access', target_user_id, auditDetails);

      return new Response(JSON.stringify({
        success: true,
        message: "Pro access revoked successfully",
        subscription: updatedSubscription,
        email_sent: emailStatus.sent,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else if (action === 'update_period_end') {
      // UPDATE PERIOD END
      if (!current_period_end) {
        return new Response(
          JSON.stringify({ error: "current_period_end is required for update_period_end action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!existingSubscription) {
        return new Response(
          JSON.stringify({ error: "No subscription found for this user" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if subscription is manual (can only update manual subscriptions)
      if (!existingSubscription.is_manual) {
        return new Response(
          JSON.stringify({ error: "Cannot update period end for paid subscription. Only manual subscriptions can be updated." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const periodEndDate = new Date(current_period_end);
      if (isNaN(periodEndDate.getTime())) {
        return new Response(
          JSON.stringify({ error: "Invalid current_period_end date" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update Stripe subscription if it exists
      if (existingSubscription.stripe_subscription_id) {
        try {
          await stripe.subscriptions.update(existingSubscription.stripe_subscription_id, {
            cancel_at: Math.floor(periodEndDate.getTime() / 1000),
          });
        } catch (stripeError) {
          console.error('Failed to update Stripe subscription:', stripeError);
          // Continue anyway - we'll still update the database
        }
      }

      // Update database subscription
      const { data: updatedSubscription, error: updateError } = await supabaseService
        .from('subscriptions')
        .update({
          current_period_end: periodEndDate.toISOString(),
        })
        .eq('user_id', target_user_id)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update subscription:', updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update subscription", details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      auditDetails = {
        ...auditDetails,
        subscription_id: existingSubscription.id,
        stripe_subscription_id: existingSubscription.stripe_subscription_id || undefined,
        previous_period_end: existingSubscription.current_period_end || undefined,
        period_end: periodEndDate.toISOString(),
      };

      // Log admin action
      await logAdminAction(supabaseService, adminUserId, 'update_period_end', target_user_id, auditDetails);

      return new Response(JSON.stringify({
        success: true,
        message: "Period end updated successfully",
        subscription: updatedSubscription,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else if (action === 'update_sites') {
      // UPDATE SITES ALLOWED
      if (sites_allowed === undefined || sites_allowed < 1) {
        return new Response(
          JSON.stringify({ error: "sites_allowed is required and must be at least 1" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (sites_allowed > 5) {
        return new Response(
          JSON.stringify({ error: "Maximum allowed sites is 5" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!existingSubscription) {
        return new Response(
          JSON.stringify({ error: "No subscription found for this user" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // For paid subscriptions, only allow increasing sites_allowed
      if (!existingSubscription.is_manual) {
        const currentSites = existingSubscription.sites_allowed || 1;
        if (sites_allowed < currentSites) {
          return new Response(
            JSON.stringify({ error: "For paid subscriptions, you can only increase the number of sites. Current: " + currentSites }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Update database subscription
      const { data: updatedSubscription, error: updateError } = await supabaseService
        .from('subscriptions')
        .update({
          sites_allowed: sites_allowed,
        })
        .eq('user_id', target_user_id)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update subscription:', updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update subscription", details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      auditDetails = {
        ...auditDetails,
        subscription_id: existingSubscription.id,
        stripe_subscription_id: existingSubscription.stripe_subscription_id || undefined,
        stripe_customer_id: existingSubscription.stripe_customer_id || undefined,
        previous_sites_allowed: existingSubscription.sites_allowed || 1,
        new_sites_allowed: sites_allowed,
      };

      // Log admin action
      await logAdminAction(supabaseService, adminUserId, 'update_sites_allowed', target_user_id, auditDetails);

      return new Response(JSON.stringify({
        success: true,
        message: "Sites allowed updated successfully",
        subscription: updatedSubscription,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Error in admin-grant-pro-access:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...getCorsHeaders(null), "Content-Type": "application/json" } }
    );
  }
});
