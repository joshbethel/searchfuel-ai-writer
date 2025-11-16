import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { BacklinkSettings } from "@/components/settings/BacklinkSettings";
import { ArticleTypeSettings } from "@/components/settings/ArticleTypeSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPlanLimits } from "@/lib/utils/subscription-limits";
import type { Database } from "@/integrations/supabase/types";

type Subscription = Database['public']['Tables']['subscriptions']['Row'];

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [blogId, setBlogId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  
  const tabParam = searchParams.get('tab');
  const defaultTab = (tabParam === 'backlinks' || tabParam === 'article-types' || tabParam === 'subscription') ? tabParam : 'account';
  const sessionId = searchParams.get('session_id');
  const canceled = searchParams.get('canceled');

  // Fetch subscription data
  const fetchSubscription = async (userId: string) => {
    setIsLoadingSubscription(true);
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        // PGRST205 = table doesn't exist - table needs to be created via migration
        if (error.code === 'PGRST205') {
          console.warn('Subscriptions table does not exist. Please run the migration.');
          setSubscription(null);
          return;
        }
        
        // PGRST116 = no rows found - create subscription with Stripe customer
        if (error.code === 'PGRST116') {
          console.log('No subscription found, creating subscription with Stripe customer for user');
          
          // The create-stripe-customer function will create both the Stripe customer and subscription
          try {
            const { data: stripeData, error: stripeError } = await supabase.functions.invoke('create-stripe-customer', {
              body: {}
            });
            
            if (stripeError) {
              console.error('Error creating Stripe customer and subscription:', stripeError);
              // Fallback: try creating subscription without Stripe customer
              const { data: newSubscription, error: createError } = await supabase
                .from('subscriptions')
                .insert({
                  user_id: userId,
                  status: 'inactive',
                  plan_name: null,
                  posts_generated_count: 0,
                  keywords_count: 0,
                })
                .select()
                .single();
              
              if (createError && createError.code !== '23505') {
                console.error('Error creating subscription:', createError);
                setSubscription(null);
              } else {
                // Fetch the subscription (may have been created by function or our insert)
                const { data: subscription } = await supabase
                  .from('subscriptions')
                  .select('*')
                  .eq('user_id', userId)
                  .single();
                setSubscription(subscription || null);
              }
            } else {
              console.log('Stripe customer and subscription created:', stripeData?.customer_id);
              // Fetch the subscription that was created by the function
              const { data: subscription } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', userId)
                .single();
              setSubscription(subscription || null);
            }
          } catch (stripeErr) {
            console.error('Exception creating Stripe customer:', stripeErr);
            // Fallback: create subscription without Stripe customer
            const { data: newSubscription } = await supabase
              .from('subscriptions')
              .insert({
                user_id: userId,
                status: 'inactive',
                plan_name: null,
                posts_generated_count: 0,
                keywords_count: 0,
              })
              .select()
              .single();
            setSubscription(newSubscription || null);
          }
        } else {
          console.error('Error fetching subscription:', error);
          setSubscription(null);
        }
      } else {
        // Subscription exists - ensure it has a Stripe customer ID
        if (data && !data.stripe_customer_id) {
          console.log('Subscription exists but no Stripe customer ID, creating one...');
          try {
            const { data: stripeData, error: stripeError } = await supabase.functions.invoke('create-stripe-customer', {
              body: {}
            });
            
            if (!stripeError && stripeData?.customer_id) {
              // Refresh subscription to get updated data
              const { data: updatedSubscription } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', userId)
                .single();
              setSubscription(updatedSubscription || data);
            } else {
              // Use existing data even if Stripe customer creation failed
              setSubscription(data);
            }
          } catch (stripeErr) {
            console.error('Exception ensuring Stripe customer:', stripeErr);
            // Use existing data anyway
            setSubscription(data);
          }
        } else {
          setSubscription(data || null);
        }
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
      // On any error, default to no subscription
      setSubscription(null);
    } finally {
      setIsLoadingSubscription(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      // Load user's blog
      if (currentUser) {
        supabase
          .from("blogs")
          .select("id")
          .eq("user_id", currentUser.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setBlogId(data.id);
          });

        // Fetch subscription
        fetchSubscription(currentUser.id);
      }
    });
  }, []);

  // Handle checkout session completion
  useEffect(() => {
    if (sessionId && user) {
      toast.success("Subscription activated! Welcome to Pro.");
      fetchSubscription(user.id);
      navigate('/settings?tab=subscription', { replace: true });
    }
  }, [sessionId, user, navigate]);

  // Handle checkout cancellation
  useEffect(() => {
    if (canceled) {
      toast.info("Checkout was canceled.");
      navigate('/settings?tab=subscription', { replace: true });
    }
  }, [canceled, navigate]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Failed to logout");
    } else {
      toast.success("Logged out successfully");
      navigate("/");
    }
  };

  const handleDeleteAccount = () => {
    // Implement delete account logic
    console.log("Delete account clicked");
    toast.info("Delete account functionality coming soon");
  };

  const handleUpgradeToPro = async () => {
    if (!user) {
      toast.error("Please sign in to upgrade");
      return;
    }

    setIsCreatingCheckout(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {}
      });

      if (error) throw error;

      if (data?.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      toast.error(error.message || 'Failed to create checkout session. Please try again.');
    } finally {
      setIsCreatingCheckout(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) {
      toast.error("Please sign in");
      return;
    }

    setIsOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-subscription', {
        body: {}
      });

      if (error) throw error;

      if (data?.url) {
        // Open Stripe Billing Portal
        window.location.href = data.url;
      } else {
        throw new Error('No portal URL received');
      }
    } catch (error: any) {
      console.error('Error opening billing portal:', error);
      toast.error(error.message || 'Failed to open billing portal. Please try again.');
    } finally {
      setIsOpeningPortal(false);
    }
  };

  // Get plan info
  const planName = subscription?.plan_name || null;
  const planLimits = getPlanLimits(planName);
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  const postsUsed = subscription?.posts_generated_count || 0;
  const keywordsUsed = subscription?.keywords_count || 0;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
        </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="article-types">Article Types</TabsTrigger>
          <TabsTrigger value="backlinks">Backlinks</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
        </TabsList>

          <TabsContent value="account" className="space-y-6 mt-6">
            {/* Organization Section */}
            <Card>
              <CardHeader>
                <CardTitle>Your Organization</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-8">
                <p className="text-muted-foreground mb-4">No organization found</p>
                <Button variant="default" className="bg-[#8B7355] hover:bg-[#8B7355]/90 text-white">
                  Set Up Organization
                </Button>
              </CardContent>
            </Card>

            {/* Account Settings Section */}
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={user?.email || ""}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Logout</span>
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={handleLogout}
                    >
                      Logout
                    </Button>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-destructive">Delete Account</span>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={handleDeleteAccount}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="article-types" className="mt-6">
            {blogId ? (
              <ArticleTypeSettings blogId={blogId} />
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-12">
                  <p className="text-muted-foreground">Complete blog setup to configure article types</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="backlinks" className="mt-6">
            {blogId ? (
              <BacklinkSettings blogId={blogId} />
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-12">
                  <p className="text-muted-foreground">Complete blog setup to configure backlinks</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="subscription" className="space-y-6 mt-6">
            {/* Subscription Section */}
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingSubscription ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Current Plan</p>
                  <p className="text-lg font-semibold capitalize">
                    {planName ? planName : 'No Plan Selected'}
                  </p>
                  {subscription && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Status: {subscription.status}
                    </p>
                  )}
                </div>

                {/* Usage Stats */}
                {isActive && (
                  <div className="space-y-3 pt-2 border-t">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Posts Generated</span>
                        <span>{postsUsed} / {planLimits.maxPostsPerMonth}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-[#8B7355] h-2 rounded-full transition-all"
                          style={{ width: `${Math.min((postsUsed / planLimits.maxPostsPerMonth) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Keywords</span>
                        <span>{keywordsUsed} / {planLimits.maxKeywordsTotal}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-[#8B7355] h-2 rounded-full transition-all"
                          style={{ width: `${Math.min((keywordsUsed / planLimits.maxKeywordsTotal) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
            
                {isActive ? (
                  <Button 
                    className="w-full bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
                    onClick={handleManageSubscription}
                    disabled={isOpeningPortal}
                  >
                    {isOpeningPortal ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Opening...
                      </>
                    ) : (
                      'Manage Subscription'
                    )}
                  </Button>
                ) : (
                  <Button 
                    className="w-full bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
                    onClick={handleUpgradeToPro}
                    disabled={isCreatingCheckout}
                  >
                    {isCreatingCheckout ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      '↗ Upgrade to Pro'
                    )}
                  </Button>
                )}
              </>
            )}

            <div className="pt-4">
              <p className="text-sm font-medium mb-3">Upgrade to get:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">20-40 AI-generated posts per month</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">SEO keyword targeting (100+ keywords)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Access to backlink network</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Competitor analysis & tracking</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Analytics dashboard</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Fully white-labeled blog</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
