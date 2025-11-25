import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Check, Sparkles, TrendingUp, Target, BarChart3, Globe, Zap, Link2, FileText, Home, ArrowLeft, Minus, Plus } from "lucide-react";
import { User } from "@supabase/supabase-js";
import { Link } from "react-router-dom";

interface Subscription {
  status: string;
  plan_name: string | null;
}

export default function Plans() {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const navigate = useNavigate();

  // Fetch subscription status
  const fetchSubscription = async (userId: string) => {
    setCheckingSubscription(true);
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status, plan_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching subscription:', error);
        setSubscription(null);
      } else {
        setSubscription(data || null);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
      setSubscription(null);
    } finally {
      setCheckingSubscription(false);
    }
  };

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error checking session:', error);
          setUser(null);
          setSubscription(null);
          setCheckingSubscription(false);
        } else if (session?.user) {
          // User is authenticated, fetch their subscription
          setUser(session.user);
          await fetchSubscription(session.user.id);
        } else {
          // No user session
          setUser(null);
          setSubscription(null);
          setCheckingSubscription(false);
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        setUser(null);
        setSubscription(null);
        setCheckingSubscription(false);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        // User is authenticated, fetch their subscription
        setUser(session.user);
        setCheckingAuth(false);
        await fetchSubscription(session.user.id);
      } else {
        // No user session
        setUser(null);
        setSubscription(null);
        setCheckingAuth(false);
        setCheckingSubscription(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Check if user has active subscription
  const hasActiveSubscription = subscription && 
    (subscription.status === 'active' || subscription.status === 'trialing') &&
    subscription.plan_name !== null &&
    subscription.plan_name !== 'free';

  const handleSelectPlan = async () => {
    if (!user) {
      toast.error("Please sign in to select a plan");
      navigate("/auth");
      return;
    }

    // If user already has active subscription, redirect to dashboard
    if (hasActiveSubscription) {
      navigate("/dashboard");
      return;
    }

    setLoading(true);
    try {
      // Ensure we have a valid session before calling the function
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        toast.error("Please sign in to select a plan");
        navigate("/auth");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { quantity }
      });

      if (error) throw error;

      if (data?.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create checkout session. Please try again.';
      toast.error(errorMessage);
      setLoading(false);
    }
  };

  const features = [
    { icon: FileText, text: "20 SEO-optimized articles per month" },
    { icon: Target, text: "100 keywords tracking" },
    { icon: Globe, text: "CMS integration (WordPress, etc.)" },
    { icon: Link2, text: "Backlink network" },
    { icon: TrendingUp, text: "Competitor analysis" },
    { icon: BarChart3, text: "Analytics dashboard" },
    { icon: Sparkles, text: "White label options" },
    { icon: Globe, text: "Custom domain" },
    { icon: Zap, text: "Auto-posting to CMS" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted py-6 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <div className="mb-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Go to Home</span>
          </Link>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Choose Your Plan
          </h1>
          <p className="text-base text-muted-foreground">
            Start generating SEO-optimized content that drives traffic and conversions
          </p>
          {/* Show message if user already has active subscription */}
          {user && !checkingSubscription && hasActiveSubscription && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg border border-primary/20 text-sm">
              <Check className="w-4 h-4" />
              <span>You already have an active subscription</span>
            </div>
          )}
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-1 gap-6 max-w-3xl mx-auto">
          {/* Pro Plan */}
          <Card className="relative border-2 border-primary shadow-lg hover:shadow-xl transition-all duration-300">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-primary text-primary-foreground px-3 py-0.5 text-xs font-semibold">
                Most Popular
              </Badge>
            </div>
            
            <CardHeader className="text-center pb-3 pt-6">
              <CardTitle className="text-2xl mb-1">Pro Plan</CardTitle>
              <CardDescription className="text-sm">
                Everything you need to scale your content
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Quantity Selector */}
              <div className="space-y-2">
                <Label htmlFor="quantity" className="text-sm font-semibold">
                  Number of Sites
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="h-8 w-8"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    id="quantity"
                    type="number"
                    min={1}
                    max={10}
                    value={quantity}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setQuantity(Math.max(1, Math.min(10, value)));
                    }}
                    className="text-center text-base font-semibold w-16 h-8"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity(Math.min(10, quantity + 1))}
                    disabled={quantity >= 10}
                    className="h-8 w-8"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select how many sites you want to manage (1-10 sites)
                </p>
              </div>

              {/* Features List - 2 columns for compact display */}
              <div className="grid grid-cols-2 gap-2">
                {features.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <div key={index} className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                        <Check className="w-2.5 h-2.5 text-primary" />
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-foreground leading-tight">{feature.text}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Limits */}
              <div className="pt-3 border-t space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Articles per month</span>
                  <span className="font-semibold text-sm text-foreground">20</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Keywords tracking</span>
                  <span className="font-semibold text-sm text-foreground">100</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Sites allowed</span>
                  <span className="font-semibold text-sm text-foreground">{quantity}</span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-2 pt-4">
              {checkingAuth ? (
                <Button
                  disabled
                  className="w-full text-base py-5"
                  size="lg"
                >
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking authentication...
                </Button>
              ) : checkingSubscription ? (
                <Button
                  disabled
                  className="w-full text-base py-5"
                  size="lg"
                >
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking subscription...
                </Button>
              ) : !user ? (
                <>
                  <Button
                    onClick={() => navigate("/auth")}
                    className="w-full text-base py-5"
                    size="lg"
                  >
                    Sign In to Select Plan
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    You must be signed in to select a plan
                  </p>
                </>
              ) : hasActiveSubscription ? (
                <>
                  <Button
                    onClick={() => navigate("/dashboard")}
                    className="w-full text-base py-5"
                    size="lg"
                  >
                    Go to Dashboard
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    You already have an active {subscription?.plan_name || 'Pro'} subscription
                  </p>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleSelectPlan}
                    disabled={loading}
                    className="w-full text-base py-5"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Select Pro Plan"
                    )}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Secure payment powered by Stripe
                  </p>
                </>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Additional Info */}
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Need help choosing?{" "}
            <a href="mailto:team@trysearchfuel.com" className="text-primary hover:underline">
              Contact our team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

