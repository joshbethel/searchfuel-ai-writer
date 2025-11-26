import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, Loader2, Globe, Plus, Edit, Trash2, Check, AlertCircle, ArrowRight } from "lucide-react";
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
import { useSiteContext } from "@/contexts/SiteContext";
import { canCreateSite, getSiteLimitInfo } from "@/lib/utils/site-limits";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";

type Subscription = Database['public']['Tables']['subscriptions']['Row'];

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedSite, allSites, selectSite, refreshSites, isLoading: sitesLoading } = useSiteContext();
  const [user, setUser] = useState<User | null>(null);
  const blogId = selectedSite?.id || null;
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [siteCount, setSiteCount] = useState<number>(0);
  const [siteLimitInfo, setSiteLimitInfo] = useState<{
    limit: number;
    count: number;
    remaining: number;
    canCreate: boolean;
    isOverLimit: boolean;
    sitesToDelete: number;
  } | null>(null);
  const [deleteSiteId, setDeleteSiteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editSiteId, setEditSiteId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    company_name: "",
    auto_post_enabled: true,
  });
  
  const tabParam = searchParams.get('tab');
  const defaultTab = (tabParam === 'backlinks' || tabParam === 'article-types' || tabParam === 'subscription' || tabParam === 'sites') ? tabParam : 'account';
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

  // Fetch site count
  const fetchSiteCount = async (userId: string) => {
    const { count, error } = await supabase
      .from("blogs")
      .select("*", { count: 'exact', head: true })
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching site count:", error);
      return;
    }

    setSiteCount(count || 0);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      // Load subscription and site count
      if (currentUser) {
        // Fetch subscription and site count
        fetchSubscription(currentUser.id);
        fetchSiteCount(currentUser.id);
        fetchSiteLimitInfo(currentUser.id);
      }
    });
  }, []);

  const fetchSiteLimitInfo = async (userId: string) => {
    const info = await getSiteLimitInfo(userId);
    setSiteLimitInfo(info);
  };

  const handleDeleteSite = async () => {
    if (!deleteSiteId) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('blogs')
        .delete()
        .eq('id', deleteSiteId);

      if (error) throw error;

      toast.success("Site deleted successfully");
      setDeleteSiteId(null);
      
      // Refresh sites list
      await refreshSites();
      
      // Refresh site count and limit info
      if (user) {
        await fetchSiteCount(user.id);
        await fetchSiteLimitInfo(user.id);
      }
    } catch (error: any) {
      console.error("Error deleting site:", error);
      toast.error("Failed to delete site: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddSite = async () => {
    if (!user) return;

    const canCreate = await canCreateSite(user.id);
    if (!canCreate) {
      const siteLimitInfo = await getSiteLimitInfo(user.id);
      if (siteLimitInfo.isOverLimit) {
        toast.error(
          `You have ${siteLimitInfo.count} sites but your plan allows ${siteLimitInfo.limit}. ` +
          `Delete ${siteLimitInfo.sitesToDelete} ${siteLimitInfo.sitesToDelete === 1 ? 'site' : 'sites'} to get back to your limit, or upgrade your plan.`
        );
      } else {
        toast.error("You've reached your site limit. Please upgrade your plan to add more sites.");
        navigate("/plans");
      }
      return;
    }

    // Navigate to dashboard to start onboarding
    navigate("/dashboard?action=add-site");
  };

  const handleEditSite = (site: typeof allSites[0]) => {
    setEditSiteId(site.id);
    setEditForm({
      title: site.title || "",
      description: site.description || "",
      company_name: site.company_name || "",
      auto_post_enabled: site.auto_post_enabled ?? true,
    });
  };

  const handleUpdateSite = async () => {
    if (!editSiteId) return;

    setIsEditing(true);
    try {
      const { error } = await supabase
        .from('blogs')
        .update({
          title: editForm.title,
          description: editForm.description || null,
          company_name: editForm.company_name || null,
          auto_post_enabled: editForm.auto_post_enabled,
        })
        .eq('id', editSiteId);

      if (error) throw error;

      toast.success("Site updated successfully");
      setEditSiteId(null);
      
      // Refresh sites list
      await refreshSites();
      
      // Refresh site count and limit info
      if (user) {
        await fetchSiteCount(user.id);
        await fetchSiteLimitInfo(user.id);
      }
    } catch (error: any) {
      console.error("Error updating site:", error);
      toast.error("Failed to update site: " + error.message);
    } finally {
      setIsEditing(false);
    }
  };

  const handleViewDashboard = async (siteId: string) => {
    // Set the site as active first
    await selectSite(siteId);
    // Then navigate to dashboard
    navigate("/dashboard");
  };

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
    } catch (error) {
      console.error('Error creating checkout session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create checkout session. Please try again.';
      toast.error(errorMessage);
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
    } catch (error) {
      console.error('Error opening billing portal:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to open billing portal. Please try again.';
      toast.error(errorMessage);
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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="article-types">Article Types</TabsTrigger>
          <TabsTrigger value="backlinks">Backlinks</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
        </TabsList>

          <TabsContent value="sites" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Sites</CardTitle>
                    <CardDescription>
                      Manage all your connected sites
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleAddSite}
                    disabled={siteLimitInfo && !siteLimitInfo.canCreate}
                    className="bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Site
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Site Limit Info */}
                {siteLimitInfo && (
                  <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">Sites</span>
                        <span className={`text-sm ${siteLimitInfo.isOverLimit ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                          {siteLimitInfo.count} of {siteLimitInfo.limit}
                        </span>
                      </div>
                      {siteLimitInfo.isOverLimit ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800">
                          Over Limit
                        </Badge>
                      ) : siteLimitInfo.count >= siteLimitInfo.limit ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                          Limit Reached
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800">
                          {siteLimitInfo.remaining} available
                        </Badge>
                      )}
                    </div>
                    {/* Over Limit Message */}
                    {siteLimitInfo.isOverLimit && (
                      <div className="pt-2 border-t border-border/50">
                        <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                                Over Site Limit
                              </p>
                              <p className="text-xs text-red-700 dark:text-red-300">
                                You have {siteLimitInfo.count} sites but your plan allows {siteLimitInfo.limit}. 
                                Delete {siteLimitInfo.sitesToDelete} {siteLimitInfo.sitesToDelete === 1 ? 'site' : 'sites'} to get back to your limit, 
                                or upgrade your plan to keep all sites and add more.
                              </p>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground text-left mb-2">
                          Your existing sites will continue to work normally. To add new sites, you must either delete sites to get under your limit or upgrade your plan.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleManageSubscription}
                          disabled={isOpeningPortal}
                          className="w-full"
                        >
                          {isOpeningPortal ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                              Opening...
                            </>
                          ) : (
                            "Upgrade Plan"
                          )}
                        </Button>
                      </div>
                    )}
                    {/* At Limit Message */}
                    {!siteLimitInfo.isOverLimit && siteLimitInfo.count >= siteLimitInfo.limit && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs text-muted-foreground text-left mb-2">
                          You've reached your site limit. Upgrade your plan to add more sites.
                        </p>
                        <div className="space-y-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleManageSubscription}
                            disabled={isOpeningPortal}
                            className="w-full"
                          >
                            {isOpeningPortal ? (
                              <>
                                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                Opening...
                              </>
                            ) : (
                              "Upgrade Plan"
                            )}
                          </Button>
                          <p className="text-xs text-muted-foreground text-left">
                            Click "Upgrade Plan" to open the billing portal. Then click "Update subscription" and increase the quantity to add more sites.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sites List */}
                {sitesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : allSites.length === 0 ? (
                  <div className="text-center py-12">
                    <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">No sites connected yet</p>
                    <Button
                      onClick={handleAddSite}
                      className="bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Your First Site
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {allSites.map((site) => {
                      const isActive = selectedSite?.id === site.id;
                      const siteUrl = site.custom_domain || site.subdomain || site.website_homepage || "No URL";
                      const getCMSName = (platform: string | null) => {
                        const names: { [key: string]: string } = {
                          wordpress: "WordPress",
                          webflow: "Webflow",
                          ghost: "Ghost",
                          shopify: "Shopify",
                          wix: "WIX",
                          framer: "Framer",
                          notion: "Notion",
                          hubspot: "HubSpot",
                          nextjs: "Next.js",
                          rest_api: "REST API",
                        };
                        return names[platform || ""] || platform || "Unknown";
                      };
                      const articleTypesCount = site.article_types 
                        ? Object.values(site.article_types).filter(Boolean).length 
                        : 0;
                      
                      return (
                        <Card 
                          key={site.id} 
                          className={`overflow-hidden transition-all hover:shadow-md ${
                            isActive ? "border-2 border-accent shadow-sm" : "border"
                          }`}
                        >
                          <CardContent className="p-0">
                            {/* Header Section */}
                            <div className={`p-5 border-b ${isActive ? "bg-accent/5" : "bg-muted/30"}`}>
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center">
                                      <Globe className="w-5 h-5 text-accent" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h3 className="text-lg font-semibold text-foreground truncate">
                                        {site.title || "Untitled Site"}
                                      </h3>
                                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                                        {siteUrl}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {isActive && (
                                      <Badge className="bg-accent text-accent-foreground border-0">
                                        <Check className="w-3 h-3 mr-1" />
                                        Active
                                      </Badge>
                                    )}
                                    {site.cms_platform ? (
                                      <Badge variant="default" className="bg-blue-600 text-white border-0">
                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                        Connected
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary">
                                        Disconnected
                                      </Badge>
                                    )}
                                    {site.onboarding_completed && (
                                      <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800">
                                        Onboarded
                                      </Badge>
                                    )}
                                    {articleTypesCount > 0 && (
                                      <Badge variant="outline">
                                        {articleTypesCount} Article Types
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleViewDashboard(site.id)}
                                    className="h-9 bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
                                  >
                                    <ArrowRight className="w-4 h-4 mr-1.5" />
                                    View Dashboard
                                  </Button>
                                  {!isActive && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => selectSite(site.id)}
                                      className="h-9"
                                    >
                                      <Check className="w-4 h-4 mr-1.5" />
                                      Set Active
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditSite(site)}
                                    className="h-9 w-9 p-0"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setDeleteSiteId(site.id)}
                                    className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Details Section */}
                            <div className="p-5">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Basic Information */}
                                <div className="space-y-4">
                                  <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                      Basic Information
                                    </h4>
                                    <div className="space-y-3">
                                      {site.description && (
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-1">Description</p>
                                          <p className="text-sm text-foreground">{site.description}</p>
                                        </div>
                                      )}
                                      {site.company_name && (
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-1">Company</p>
                                          <p className="text-sm font-medium text-foreground">{site.company_name}</p>
                                        </div>
                                      )}
                                      {site.subdomain && (
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-1">Subdomain</p>
                                          <p className="text-sm text-foreground font-mono">{site.subdomain}</p>
                                        </div>
                                      )}
                                      {site.custom_domain && (
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-1">Custom Domain</p>
                                          <p className="text-sm text-foreground font-mono">{site.custom_domain}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* CMS Configuration */}
                                {site.cms_platform && (
                                  <div className="space-y-4">
                                    <div>
                                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                        CMS Configuration
                                      </h4>
                                      <div className="space-y-3">
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-1">Platform</p>
                                          <p className="text-sm font-medium text-foreground">{getCMSName(site.cms_platform)}</p>
                                        </div>
                                        {site.cms_site_url && (
                                          <div>
                                            <p className="text-xs text-muted-foreground mb-1">CMS URL</p>
                                            <a 
                                              href={site.cms_site_url} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-sm text-accent hover:underline truncate block"
                                            >
                                              {site.cms_site_url}
                                            </a>
                                          </div>
                                        )}
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-1">Mode</p>
                                          <Badge variant="outline" className="text-xs">
                                            {site.mode?.replace('_', ' ') || "N/A"}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Settings & Stats */}
                                <div className="space-y-4">
                                  <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                      Settings & Stats
                                    </h4>
                                    <div className="space-y-3">
                                      {site.auto_post_enabled !== null && (
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-1.5">Auto-Post</p>
                                          {site.auto_post_enabled ? (
                                            <Badge className="bg-green-600 text-white border-0">
                                              Enabled
                                            </Badge>
                                          ) : (
                                            <Badge variant="secondary">Disabled</Badge>
                                          )}
                                        </div>
                                      )}
                                      <div>
                                        <p className="text-xs text-muted-foreground mb-1">Created</p>
                                        <p className="text-sm text-foreground">
                                          {format(new Date(site.created_at), "MMM d, yyyy")}
                                        </p>
                                      </div>
                                      {site.last_post_generated_at && (
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-1">Last Post Generated</p>
                                          <p className="text-sm text-foreground">
                                            {format(new Date(site.last_post_generated_at), "MMM d, yyyy")}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

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
                    {subscription?.sites_allowed && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Sites</span>
                          <span>{siteCount} / {subscription.sites_allowed}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all ${
                              siteCount >= subscription.sites_allowed 
                                ? 'bg-amber-500' 
                                : 'bg-[#8B7355]'
                            }`}
                            style={{ width: `${Math.min((siteCount / subscription.sites_allowed) * 100, 100)}%` }}
                          />
                        </div>
                        {siteCount >= subscription.sites_allowed && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Site limit reached. Upgrade to add more sites.
                          </p>
                        )}
                      </div>
                    )}
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
                  <div className="space-y-2">
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
                        'Select Pro Plan'
                      )}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      Subscription required to access all features
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="pt-4">
              <p className="text-sm font-medium mb-3">Pro Plan includes:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">20 SEO-optimized articles per month</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">100 keywords tracking</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">CMS integration (WordPress, etc.)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Backlink network</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Competitor analysis</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Analytics dashboard</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">White label options</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Custom domain</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Auto-posting to CMS</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

          </TabsContent>
        </Tabs>

        {/* Edit Site Dialog */}
        <Dialog open={!!editSiteId} onOpenChange={(open) => !open && setEditSiteId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Site</DialogTitle>
              <DialogDescription>
                Update your site's title, description, and company name.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title *</Label>
                <Input
                  id="edit-title"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="Site title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Site description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-company">Company Name</Label>
                <Input
                  id="edit-company"
                  value={editForm.company_name}
                  onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                  placeholder="Company name"
                />
              </div>
              <div className="flex items-center justify-between space-x-2 pt-2">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-auto-post">Auto-Post</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically publish generated articles to your CMS
                  </p>
                </div>
                <Switch
                  id="edit-auto-post"
                  checked={editForm.auto_post_enabled}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, auto_post_enabled: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditSiteId(null)}
                disabled={isEditing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateSite}
                disabled={isEditing || !editForm.title.trim()}
                className="bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
              >
                {isEditing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Site"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Site Confirmation Dialog */}
        <AlertDialog open={!!deleteSiteId} onOpenChange={(open) => !open && setDeleteSiteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                Delete Site
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this site? This action cannot be undone. 
                All articles, keywords, and data associated with this site will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteSite}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Site"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
