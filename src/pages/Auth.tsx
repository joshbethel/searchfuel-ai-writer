import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Helper function to create Stripe customer (non-blocking)
  const createStripeCustomer = async () => {
    try {
      const { error: stripeError } = await supabase.functions.invoke('create-stripe-customer', {
        body: {}
      });
      
      if (stripeError) {
        console.error('Error creating Stripe customer:', stripeError);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error calling create-stripe-customer:', err);
      return false;
    }
  };

  // Helper function to check subscription and redirect
  const checkSubscriptionAndRedirect = async (userId: string) => {
    try {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status, plan_name')
        .eq('user_id', userId)
        .maybeSingle();

      // If no subscription or no active plan, redirect to plans page
      if (!subscription || subscription.status !== 'active' || !subscription.plan_name) {
        navigate("/plans");
      } else {
        navigate("/dashboard");
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      // On error, redirect to plans to be safe
      navigate("/plans");
    }
  };

  useEffect(() => {
    // Check URL params for mode
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    if (mode === "signup") {
      setIsLogin(false);
    } else if (mode === "signin") {
      setIsLogin(true);
    }

    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Check subscription status and redirect accordingly
        checkSubscriptionAndRedirect(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.id);
      
      if (event === 'SIGNED_IN' && session) {
        // If this is a new user (just confirmed email), create Stripe customer
        // Check if user already has a subscription record
        const { data: existingSubscription } = await supabase
          .from('subscriptions')
          .select('stripe_customer_id')
          .eq('user_id', session.user.id)
          .maybeSingle();
        
        // If no Stripe customer exists, create one (this handles email confirmation flow)
        if (!existingSubscription?.stripe_customer_id) {
          createStripeCustomer().catch(err => {
            console.error('Failed to create Stripe customer after email confirmation:', err);
          });
        }
        
        // Check subscription status and redirect accordingly
        await checkSubscriptionAndRedirect(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        toast.success("Logged in successfully!");
        // Navigation will be handled by onAuthStateChange
      } else {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/plans`,
          },
        });
        if (signUpError) throw signUpError;
        
        // Create Stripe customer only if we have a session (auto-confirm enabled)
        // Otherwise, it will be created when user confirms their email
        if (signUpData.user) {
          if (signUpData.session) {
            // We have a session - create Stripe customer now
            createStripeCustomer().catch(err => {
              console.error('Failed to create Stripe customer:', err);
            });
            toast.success("Account created successfully!");
          } else {
            // No session - email confirmation required
            // Stripe customer will be created after email confirmation via auth state change handler
            toast.success("Account created! Please check your email to confirm.");
          }

          // Send account creation notifications (non-blocking)
          // This sends welcome email to user and internal notification to team
          supabase.functions.invoke('send-account-notifications', {
            body: {
              user_id: signUpData.user.id,
              email: signUpData.user.email || email,
              created_at: signUpData.user.created_at,
              user_name: signUpData.user.user_metadata?.full_name || signUpData.user.user_metadata?.name
            }
          }).catch(err => {
            // Log but don't block signup - notifications are non-critical
            console.error('Failed to send account creation notifications:', err);
          });
        } else {
          toast.success("Account created! Please check your email to confirm.");
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      toast.error(error.message || "Authentication failed");
      // Clear any potentially corrupted session data
      await supabase.auth.signOut();
      localStorage.clear();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to SearchFuel</h1>
          <p className="text-muted-foreground">
            {isLogin ? "Sign in to your account" : "Create a new account"}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Please wait
              </>
            ) : isLogin ? (
              "Sign In"
            ) : (
              "Sign Up"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </Card>
    </div>
  );
}
