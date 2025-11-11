import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
        
        // Get plan from metadata (if available) or default to 'pro'
        const planName = subscription.items.data[0].plan?.metadata?.plan || 'pro';
        
        await supabase
          .from('subscriptions')
          .upsert({
            user_id: session.metadata?.user_id,
            stripe_customer_id: subscription.customer as string,
            stripe_subscription_id: subscription.id,
            stripe_price_id: subscription.items.data[0].price.id,
            status: subscription.status,
            plan_name: planName,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
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
      const subscription = event.data.object as Stripe.Subscription;
      
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
      
      // Get plan from metadata (if available) or use existing
      const newPlan = subscription.items.data[0].plan?.metadata?.plan || existing.plan_name;
      
      // Reset usage counts if plan changed
      const updates: any = {
        status: subscription.status,
        plan_name: newPlan,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at 
          ? new Date(subscription.canceled_at * 1000).toISOString() 
          : null,
      };
      
      // Reset usage if plan changed
      if (existing.plan_name !== newPlan) {
        updates.posts_generated_count = 0;
        updates.keywords_count = 0;
      }
      
      await supabase
        .from('subscriptions')
        .update(updates)
        .eq('stripe_subscription_id', subscription.id);
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

