import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
          // Create new subscription (only if user_id is provided in metadata)
          if (!session.metadata?.user_id) {
            console.error(`Cannot create subscription: user_id missing from session metadata for subscription ${subscription.id}`);
            break;
          }
          
          console.log(`Creating new subscription ${subscription.id} for user ${session.metadata.user_id}`);
          await supabase
            .from('subscriptions')
            .upsert({
              user_id: session.metadata.user_id,
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
      const cancelAtISO = timestampToISO(subscription.cancel_at);
      if (cancelAtISO !== null) {
        updates.cancel_at = cancelAtISO;
      }
      
      const canceledAtISO = timestampToISO(subscription.canceled_at);
      if (canceledAtISO !== null) {
        updates.canceled_at = canceledAtISO;
      }
      
      // Log cancellation details if present
      if (subscription.cancellation_details) {
        console.log(`Cancellation details for subscription ${subscription.id}:`, {
          reason: subscription.cancellation_details.reason,
          comment: subscription.cancellation_details.comment,
          feedback: subscription.cancellation_details.feedback,
        });
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

