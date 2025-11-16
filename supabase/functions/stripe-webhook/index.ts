import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// Helper function to determine plan name from subscription item
function getPlanName(subscriptionItem: Stripe.SubscriptionItem): string {
  // First, try to get from price metadata (preferred)
  if (subscriptionItem.price?.metadata?.plan) {
    return subscriptionItem.price.metadata.plan;
  }
  
  // Fallback: try plan metadata (legacy)
  if (subscriptionItem.plan?.metadata?.plan) {
    return subscriptionItem.plan.metadata.plan;
  }
  
  // Fallback: check if this is a known pro price ID
  const stripeMode = Deno.env.get("STRIPE_MODE") || "test";
  const proPriceId = stripeMode === "live"
    ? Deno.env.get("STRIPE_PRICE_LIVE")
    : Deno.env.get("STRIPE_PRICE_TEST");
  
  const priceId = subscriptionItem.price?.id || subscriptionItem.plan?.id;
  if (priceId && proPriceId && priceId === proPriceId) {
    return 'pro';
  }
  
  // Default to 'pro' for any paid subscription (since free plan doesn't use Stripe)
  return 'pro';
}

// Helper function to safely convert Unix timestamp to ISO string
function timestampToISO(timestamp: number | null | undefined): string | null {
  if (timestamp == null || typeof timestamp !== 'number') {
    return null;
  }
  
  // Validate timestamp is reasonable (between 1970 and 2100)
  if (timestamp < 0 || timestamp > 4102444800) {
    console.warn(`Invalid timestamp value: ${timestamp}`);
    return null;
  }
  
  try {
    const date = new Date(timestamp * 1000);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date created from timestamp: ${timestamp}`);
      return null;
    }
    return date.toISOString();
  } catch (error) {
    console.error(`Error converting timestamp ${timestamp} to ISO:`, error);
    return null;
  }
}

serve(async (req) => {
  const stripeMode = Deno.env.get("STRIPE_MODE") || "test";
  const stripeKey = stripeMode === "live" 
    ? Deno.env.get("STRIPE_SECRET_KEY") || ""
    : Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";
  const webhookSecret = stripeMode === "live"
    ? Deno.env.get("STRIPE_WEBHOOK_SECRET") || ""
    : Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST") || "";

  if (!stripeKey || !webhookSecret) {
    return new Response("Stripe configuration missing", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2025-10-29.clover",
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }

  // Handle different event types
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription') {
        const subscriptionId = session.subscription as string;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        
        // Get plan from metadata or price ID
        const planName = getPlanName(subscription.items.data[0]);
        
        // Try to get period dates - check subscription items first (they're more reliable in webhook payloads)
        // Then fallback to subscription-level fields
        let periodStart: number | null | undefined = undefined;
        let periodEnd: number | null | undefined = undefined;
        
        // First, check subscription items (they often have period info in webhook payloads)
        if (subscription.items?.data?.length > 0) {
          const firstItem = subscription.items.data[0] as any; // Use any to access potentially untyped fields
          if (firstItem?.current_period_start != null && typeof firstItem.current_period_start === 'number') {
            periodStart = firstItem.current_period_start;
          }
          if (firstItem?.current_period_end != null && typeof firstItem.current_period_end === 'number') {
            periodEnd = firstItem.current_period_end;
          }
        }
        
        // Fallback: check subscription-level fields if not found in items
        if (periodStart == null && subscription.current_period_start != null) {
          periodStart = subscription.current_period_start;
        }
        if (periodEnd == null && subscription.current_period_end != null) {
          periodEnd = subscription.current_period_end;
        }
        
        // Log subscription period dates for debugging
        console.log('Subscription period dates:', {
          subscription_level_start: subscription.current_period_start,
          subscription_level_end: subscription.current_period_end,
          item_level_start: subscription.items?.data?.[0] ? (subscription.items.data[0] as any).current_period_start : 'N/A',
          item_level_end: subscription.items?.data?.[0] ? (subscription.items.data[0] as any).current_period_end : 'N/A',
          final_periodStart: periodStart,
          final_periodEnd: periodEnd,
          converted_start: timestampToISO(periodStart),
          converted_end: timestampToISO(periodEnd),
        });
        
        // Warn if period dates are still missing
        if (periodStart == null || periodEnd == null) {
          console.warn(`Warning: Subscription ${subscription.id} is missing period dates. Status: ${subscription.status}`);
        }
        
        // Check if subscription already exists by subscription_id or customer_id
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('*')
          .or(`stripe_subscription_id.eq.${subscription.id},stripe_customer_id.eq.${subscription.customer}`)
          .maybeSingle();
        
        if (existingSub) {
          // Update existing subscription - preserve existing user_id
          console.log(`Updating existing subscription ${subscription.id} for customer ${subscription.customer} (existing user_id: ${existingSub.user_id})`);
          await supabase
            .from('subscriptions')
            .update({
              // Preserve existing user_id - don't overwrite with potentially wrong metadata
              stripe_subscription_id: subscription.id,
              stripe_customer_id: subscription.customer as string,
              stripe_price_id: subscription.items.data[0].price.id,
              status: subscription.status,
              plan_name: planName,
              current_period_start: timestampToISO(periodStart),
              current_period_end: timestampToISO(periodEnd),
              posts_generated_count: 0, // Reset on new subscription
              keywords_count: 0,
            })
            .eq('id', existingSub.id);
        } else {
          // Try to get user_id from metadata first, then fallback to email lookup
          let userId: string | null = session.metadata?.user_id || null;
          
          // If user_id is missing, try to look up user by email
          if (!userId) {
            // Get customer email from session - check customer_details first (actual payload location)
            // then fallback to customer_email field, then retrieve from Stripe
            let customerEmail: string | null = 
              session.customer_details?.email || 
              session.customer_email || 
              null;
            
            if (!customerEmail && subscription.customer) {
              try {
                const customer = await stripe.customers.retrieve(subscription.customer as string);
                if (customer && !('deleted' in customer) && customer.email) {
                  customerEmail = customer.email;
                }
              } catch (err) {
                console.error(`Error retrieving customer ${subscription.customer}:`, err);
              }
            }
            
            // Look up user by email if we have it
            // Use admin API to find user by email
            if (customerEmail) {
              try {
                const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
                if (!authError && authUsers) {
                  const matchingUser = authUsers.users.find(
                    u => u.email?.toLowerCase() === customerEmail.toLowerCase()
                  );
                  if (matchingUser) {
                    userId = matchingUser.id;
                    console.log(`Found user by email: ${customerEmail} -> ${userId}`);
                  }
                } else if (authError) {
                  console.error(`Error looking up user by email ${customerEmail}:`, authError);
                }
              } catch (err) {
                console.error(`Exception while looking up user by email ${customerEmail}:`, err);
              }
            }
          }
          
          if (!userId) {
            console.error(`Cannot create subscription: user_id missing from session metadata and no user found for email. Subscription: ${subscription.id}, Customer: ${subscription.customer}`);
            break;
          }
          
          console.log(`Creating new subscription ${subscription.id} for user ${userId}`);
          await supabase
            .from('subscriptions')
            .upsert({
              user_id: userId,
              stripe_customer_id: subscription.customer as string,
              stripe_subscription_id: subscription.id,
              stripe_price_id: subscription.items.data[0].price.id,
              status: subscription.status,
              plan_name: planName,
              current_period_start: timestampToISO(periodStart),
              current_period_end: timestampToISO(periodEnd),
              posts_generated_count: 0, // Reset on new subscription
              keywords_count: 0,
            }, {
              onConflict: 'user_id'
            });
        }
      }
      break;
    }
    
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const subscriptionFromEvent = event.data.object as Stripe.Subscription;
      
      // Retrieve full subscription object from Stripe to ensure we have all fields
      // This is especially important for period dates which might not be in the webhook payload
      const subscription = await stripe.subscriptions.retrieve(subscriptionFromEvent.id);
      
      // Log subscription period dates and cancellation info for debugging
      const itemPeriodStart = subscription.items?.data?.[0] ? (subscription.items.data[0] as any).current_period_start : undefined;
      const itemPeriodEnd = subscription.items?.data?.[0] ? (subscription.items.data[0] as any).current_period_end : undefined;
      
      console.log(`[${event.type}] Subscription details:`, {
        subscription_id: subscription.id,
        subscription_level_start: subscription.current_period_start,
        subscription_level_end: subscription.current_period_end,
        item_level_start: itemPeriodStart,
        item_level_end: itemPeriodEnd,
        cancel_at: subscription.cancel_at,
        cancel_at_converted: timestampToISO(subscription.cancel_at),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at,
        cancellation_details: subscription.cancellation_details,
      });
      
      // Lookup by subscription_id first (most reliable), then fallback to customer_id
      let existing = null;
      
      // First try to find by subscription_id (most specific)
      const { data: existingBySubId } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('stripe_subscription_id', subscription.id)
        .maybeSingle();
      
      if (existingBySubId) {
        existing = existingBySubId;
        console.log(`Found subscription by subscription_id: ${subscription.id}`);
      } else {
        // Fallback: lookup by customer_id
        const { data: existingByCustomerId } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('stripe_customer_id', subscription.customer as string)
          .maybeSingle();
        
        if (existingByCustomerId) {
          existing = existingByCustomerId;
          console.log(`Found subscription by customer_id: ${subscription.customer}`);
        }
      }
      
      if (!existing) {
        console.warn(`No subscription found for subscription ${subscription.id} or customer ${subscription.customer}. This might be a new subscription that hasn't been processed yet.`);
        // Don't create a new subscription here - let checkout.session.completed handle new subscriptions
        break;
      }
      
      // Get plan from metadata or price ID, fallback to existing if not found
      const newPlan = getPlanName(subscription.items.data[0]) || existing.plan_name;
      
      // Try to get period dates - check subscription items first (they're more reliable in webhook payloads)
      // Then fallback to subscription-level fields
      let periodStart: number | null | undefined = undefined;
      let periodEnd: number | null | undefined = undefined;
      
      // First, check subscription items (they often have period info in webhook payloads)
      if (subscription.items?.data?.length > 0) {
        const firstItem = subscription.items.data[0] as any; // Use any to access potentially untyped fields
        if (firstItem?.current_period_start != null && typeof firstItem.current_period_start === 'number') {
          periodStart = firstItem.current_period_start;
        }
        if (firstItem?.current_period_end != null && typeof firstItem.current_period_end === 'number') {
          periodEnd = firstItem.current_period_end;
        }
      }
      
      // Fallback: check subscription-level fields if not found in items
      if (periodStart == null && subscription.current_period_start != null) {
        periodStart = subscription.current_period_start;
      }
      if (periodEnd == null && subscription.current_period_end != null) {
        periodEnd = subscription.current_period_end;
      }
      
      // If still no period dates, preserve existing values or use null
      const periodStartISO = timestampToISO(periodStart);
      const periodEndISO = timestampToISO(periodEnd);
      
      // Log final period dates being used
      const finalItemPeriodStart = subscription.items?.data?.[0] ? (subscription.items.data[0] as any).current_period_start : undefined;
      console.log(`[${event.type}] Final period dates:`, {
        periodStart,
        periodEnd,
        periodStartISO,
        periodEndISO,
        source: periodStart === finalItemPeriodStart ? 'subscription_item' : (periodStart === subscription.current_period_start ? 'subscription_level' : 'fallback'),
      });
      
      // Warn if period dates are missing (shouldn't happen normally)
      if (periodStart == null || periodEnd == null) {
        console.warn(`Warning: Subscription ${subscription.id} is missing period dates. Status: ${subscription.status}, will preserve existing values if available.`);
      }
      
      // Reset usage counts if plan changed
      const updates: {
        status: string;
        plan_name: string;
        current_period_start?: string | null;
        current_period_end?: string | null;
        cancel_at_period_end: boolean;
        cancel_at?: string | null;
        canceled_at?: string | null;
        cancellation_details?: any;
        stripe_subscription_id?: string;
        posts_generated_count?: number;
        keywords_count?: number;
      } = {
        status: subscription.status,
        plan_name: newPlan,
        cancel_at_period_end: subscription.cancel_at_period_end,
      };
      
      // Only update period dates if we have valid values
      // This prevents overwriting existing valid dates with null
      if (periodStartISO !== null) {
        updates.current_period_start = periodStartISO;
      }
      if (periodEndISO !== null) {
        updates.current_period_end = periodEndISO;
      }
      
      // Update cancellation-related fields
      // Handle cancel_at: set if exists, clear if null (user reactivated subscription)
      if (subscription.cancel_at != null) {
        const cancelAtISO = timestampToISO(subscription.cancel_at);
        if (cancelAtISO !== null) {
          updates.cancel_at = cancelAtISO;
        }
      } else {
        // Clear cancel_at if subscription was reactivated (cancel_at is null)
        // This happens when a scheduled cancellation is canceled
        updates.cancel_at = null;
      }
      
      // Handle canceled_at: set if exists (historical record - don't clear)
      // canceled_at is a historical timestamp and should remain even if subscription is reactivated
      if (subscription.canceled_at != null) {
        const canceledAtISO = timestampToISO(subscription.canceled_at);
        if (canceledAtISO !== null) {
          updates.canceled_at = canceledAtISO;
        }
      }
      // Note: We don't clear canceled_at if it's null - it's a historical record
      
      // Handle cancellation_details: save if present, clear if subscription is reactivated
      if (subscription.cancellation_details) {
        // Save cancellation details as JSONB
        updates.cancellation_details = {
          reason: subscription.cancellation_details.reason || null,
          comment: subscription.cancellation_details.comment || null,
          feedback: subscription.cancellation_details.feedback || null,
        };
        
        console.log(`Cancellation details for subscription ${subscription.id}:`, {
          reason: subscription.cancellation_details.reason,
          comment: subscription.cancellation_details.comment,
          feedback: subscription.cancellation_details.feedback,
        });
      } else {
        // Clear cancellation_details if subscription was reactivated (no cancellation details)
        updates.cancellation_details = null;
      }
      
      // Reset usage if plan changed
      if (existing.plan_name !== newPlan) {
        updates.posts_generated_count = 0;
        updates.keywords_count = 0;
      }
      
      // Update using the existing row's ID (most reliable)
      // Also update stripe_subscription_id in case it changed (e.g., new subscription for same customer)
      updates.stripe_subscription_id = subscription.id;
      
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update(updates)
        .eq('id', existing.id);
      
      if (updateError) {
        console.error(`Error updating subscription ${subscription.id} (row id: ${existing.id}):`, updateError);
      } else {
        console.log(`Successfully updated subscription ${subscription.id} (row id: ${existing.id}) with status: ${subscription.status}`);
      }
      break;
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      
      // Reset to free plan on deletion
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          plan_name: 'free',
          posts_generated_count: 0,
          keywords_count: 0,
          canceled_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.id);
      break;
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await supabase
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('stripe_subscription_id', invoice.subscription as string);
      break;
    }
    
    default:
      console.warn(`Unhandled webhook event type: ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

