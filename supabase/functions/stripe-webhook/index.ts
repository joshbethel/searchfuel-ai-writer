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
        
        // Log subscription period dates for debugging
        console.log('Subscription period dates:', {
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          converted_start: timestampToISO(subscription.current_period_start),
          converted_end: timestampToISO(subscription.current_period_end),
        });
        
        await supabase
          .from('subscriptions')
          .upsert({
            user_id: session.metadata?.user_id,
            stripe_customer_id: subscription.customer as string,
            stripe_subscription_id: subscription.id,
            stripe_price_id: subscription.items.data[0].price.id,
            status: subscription.status,
            plan_name: planName,
            current_period_start: timestampToISO(subscription.current_period_start),
            current_period_end: timestampToISO(subscription.current_period_end),
            posts_generated_count: 0, // Reset on new subscription
            keywords_count: 0,
          }, {
            onConflict: 'user_id'
          });
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
      console.log(`[${event.type}] Subscription details:`, {
        subscription_id: subscription.id,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        converted_start: timestampToISO(subscription.current_period_start),
        converted_end: timestampToISO(subscription.current_period_end),
        cancel_at: subscription.cancel_at,
        cancel_at_converted: timestampToISO(subscription.cancel_at),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at,
        cancellation_details: subscription.cancellation_details,
      });
      
      // Lookup by customer_id (more reliable)
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('stripe_customer_id', subscription.customer as string)
        .single();
      
      if (!existing) {
        console.warn(`No subscription found for customer ${subscription.customer}`);
        break;
      }
      
      // Get plan from metadata or price ID, fallback to existing if not found
      const newPlan = getPlanName(subscription.items.data[0]) || existing.plan_name;
      
      // Reset usage counts if plan changed
      const updates: {
        status: string;
        plan_name: string;
        current_period_start: string | null;
        current_period_end: string | null;
        cancel_at_period_end: boolean;
        cancel_at: string | null;
        canceled_at: string | null;
        posts_generated_count?: number;
        keywords_count?: number;
      } = {
        status: subscription.status,
        plan_name: newPlan,
        current_period_start: timestampToISO(subscription.current_period_start),
        current_period_end: timestampToISO(subscription.current_period_end),
        cancel_at_period_end: subscription.cancel_at_period_end,
        cancel_at: timestampToISO(subscription.cancel_at),
        canceled_at: timestampToISO(subscription.canceled_at),
      };
      
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
      
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update(updates)
        .eq('stripe_subscription_id', subscription.id);
      
      if (updateError) {
        console.error('Error updating subscription:', updateError);
      } else {
        console.log(`Successfully updated subscription ${subscription.id} with period dates`);
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

