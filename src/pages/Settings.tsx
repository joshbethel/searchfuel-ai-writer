import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, Loader2, Globe, Plus, Edit, Trash2, Check, AlertCircle, ArrowRight, FileText, Search, Wifi, WifiOff, ExternalLink, BarChart3, MoreVertical, Key, Copy, Eye, EyeOff, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [siteStats, setSiteStats] = useState<Record<string, {
    total: number;
    published: number;
    scheduled: number;
    pending: number;
    failed: number;
  }>>({});
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [siteSearchQuery, setSiteSearchQuery] = useState("");
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState<{
    id: string;
    name: string;
    key_prefix: string;
    scopes: string[];
    expires_at: string | null;
    created_at: string;
    last_used_at: string | null;
    is_expired: boolean;
    is_revoked: boolean;
    is_active: boolean;
  }[]>([]);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [showKeyCreatedModal, setShowKeyCreatedModal] = useState(false);
  const [newKeyData, setNewKeyData] = useState<{ key: string; name: string; scopes: string[] } | null>(null);
  const [createKeyForm, setCreateKeyForm] = useState({
    name: "",
    preset: "publish_only" as "publish_only" | "read_only" | "full_access" | "custom",
    customScopes: [] as string[],
    expiresInDays: null as number | null,
  });
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [keyToRevoke, setKeyToRevoke] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  
  const tabParam = searchParams.get('tab');
  const defaultTab = (tabParam === 'subscription' || tabParam === 'sites' || tabParam === 'api-keys') ? tabParam : 'account';
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

  // Fetch site statistics
  const fetchSiteStats = async (siteId: string) => {
    try {
      const { data: posts, error } = await supabase
        .from("blog_posts")
        .select("publishing_status, scheduled_publish_date")
        .eq("blog_id", siteId);

      if (error) throw error;

      const stats = {
        total: posts?.length || 0,
        published: posts?.filter(p => p.publishing_status === 'published').length || 0,
        scheduled: posts?.filter(p => p.scheduled_publish_date !== null).length || 0,
        pending: posts?.filter(p => p.publishing_status === 'pending' && !p.scheduled_publish_date).length || 0,
        failed: posts?.filter(p => p.publishing_status === 'failed').length || 0,
      };

      setSiteStats(prev => ({ ...prev, [siteId]: stats }));
    } catch (error) {
      console.error("Error fetching site stats:", error);
    }
  };

  // Fetch stats for all sites
  useEffect(() => {
    if (allSites.length > 0) {
      allSites.forEach(site => {
        fetchSiteStats(site.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSites.length]);

  // Test CMS connection
  const handleTestConnection = async (site: typeof allSites[0]) => {
    if (!site.cms_platform || !site.cms_site_url) {
      toast.error("CMS is not configured for this site");
      return;
    }

    setTestingConnection(site.id);
    try {
      const credentials = site.cms_credentials as { 
        apiKey?: string; 
        apiSecret?: string; 
        accessToken?: string;
        username?: string;
        password?: string;
      } || {};

      const { data, error } = await supabase.functions.invoke('test-cms-connection', {
        body: {
          platform: site.cms_platform,
          siteUrl: site.cms_site_url,
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          accessToken: credentials.accessToken,
          username: credentials.username,
          password: credentials.password,
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success("✅ Connection verified!");
        // Update last sync time
        await supabase
          .from('blogs')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', site.id);
        await refreshSites();
      } else {
        toast.error("❌ Connection failed: " + (data.error || "Unknown error"));
      }
    } catch (error: any) {
      console.error("Connection test error:", error);
      toast.error("Connection test failed: " + error.message);
    } finally {
      setTestingConnection(null);
    }
  };

  // Handle reconnect CMS
  const handleReconnectCMS = (siteId: string) => {
    selectSite(siteId);
    navigate("/dashboard?action=reconnect-cms");
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

  // API Keys management functions
  const fetchApiKeys = async () => {
    if (!user) return;
    
    setIsLoadingApiKeys(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      if (!token) {
        toast.error("Please sign in to view API keys");
        return;
      }

      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        body: { action: 'list' },
      });

      if (error) throw error;

      if (data.success) {
        setApiKeys(data.keys || []);
      } else {
        throw new Error(data.error || 'Failed to fetch API keys');
      }
    } catch (error: any) {
      console.error('Error fetching API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setIsLoadingApiKeys(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (!createKeyForm.name.trim()) {
      toast.error("Please enter a name for the API key");
      return;
    }

    setIsCreatingKey(true);
    try {
      const body: any = {
        action: 'create',
        name: createKeyForm.name.trim(),
      };

      if (createKeyForm.preset === 'custom') {
        if (createKeyForm.customScopes.length === 0) {
          toast.error("Please select at least one scope");
          setIsCreatingKey(false);
          return;
        }
        body.scopes = createKeyForm.customScopes;
      } else {
        body.preset = createKeyForm.preset;
      }

      if (createKeyForm.expiresInDays) {
        body.expires_in_days = createKeyForm.expiresInDays;
      }

      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        body,
      });

      if (error) throw error;

      if (data.success) {
        setNewKeyData({
          key: data.key.key,
          name: data.key.name,
          scopes: data.key.scopes,
        });
        setShowCreateKeyModal(false);
        setShowKeyCreatedModal(true);
        setCreateKeyForm({
          name: "",
          preset: "publish_only",
          customScopes: [],
          expiresInDays: null,
        });
        fetchApiKeys();
      } else {
        throw new Error(data.error || 'Failed to create API key');
      }
    } catch (error: any) {
      console.error('Error creating API key:', error);
      toast.error(error.message || 'Failed to create API key');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    setRevokingKeyId(keyId);
    try {
      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        body: { action: 'revoke', key_id: keyId },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message || 'API key revoked');
        setKeyToRevoke(null);
        fetchApiKeys();
      } else {
        throw new Error(data.error || 'Failed to revoke API key');
      }
    } catch (error: any) {
      console.error('Error revoking API key:', error);
      toast.error(error.message || 'Failed to revoke API key');
    } finally {
      setRevokingKeyId(null);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        body: { action: 'delete', key_id: keyId },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message || 'API key deleted');
        fetchApiKeys();
      } else {
        throw new Error(data.error || 'Failed to delete API key');
      }
    } catch (error: any) {
      console.error('Error deleting API key:', error);
      toast.error(error.message || 'Failed to delete API key');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setKeyCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setKeyCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const getScopeLabel = (scope: string) => {
    const labels: Record<string, string> = {
      'posts:read': 'Read Posts',
      'posts:write': 'Write Posts',
      'posts:publish': 'Publish Posts',
      'sites:read': 'Read Sites',
      'keywords:read': 'Read Keywords',
      'keywords:write': 'Write Keywords',
      'full_access': 'Full Access',
    };
    return labels[scope] || scope;
  };

  const toggleCustomScope = (scope: string) => {
    setCreateKeyForm(prev => ({
      ...prev,
      customScopes: prev.customScopes.includes(scope)
        ? prev.customScopes.filter(s => s !== scope)
        : [...prev.customScopes, scope],
    }));
  };

  // Fetch API keys when user is available and tab is api-keys
  useEffect(() => {
    if (user && tabParam === 'api-keys') {
      fetchApiKeys();
    }
  }, [user, tabParam]);

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
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="api-keys" onClick={() => fetchApiKeys()}>API Keys</TabsTrigger>
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
                {/* Site Search */}
                {allSites.length >= 2 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search sites by name, URL, or CMS platform..."
                      value={siteSearchQuery}
                      onChange={(e) => setSiteSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                )}

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
                    {/* General Info: How to Increase Sites */}
                    {!siteLimitInfo.isOverLimit && siteLimitInfo.count < siteLimitInfo.limit && siteLimitInfo.count > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-muted-foreground text-left">
                            Need more sites? Visit <button onClick={handleManageSubscription} className="underline hover:no-underline font-medium text-foreground">Manage Subscription</button> to increase your site limit.
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
                    {allSites
                      .filter((site) => {
                        if (!siteSearchQuery) return true;
                        const query = siteSearchQuery.toLowerCase();
                        const siteUrl = (site.custom_domain || site.subdomain || site.website_homepage || "").toLowerCase();
                        const cmsPlatform = (site.cms_platform || "").toLowerCase();
                        return (
                          (site.title || "").toLowerCase().includes(query) ||
                          siteUrl.includes(query) ||
                          cmsPlatform.includes(query) ||
                          (site.company_name || "").toLowerCase().includes(query)
                        );
                      })
                      .map((site) => {
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
                      const stats = siteStats[site.id] || { total: 0, published: 0, scheduled: 0, pending: 0, failed: 0 };
                      const isTesting = testingConnection === site.id;
                      
                      return (
                        <Card 
                          key={site.id} 
                          className={`overflow-hidden transition-all hover:shadow-md ${
                            isActive ? "border-2 border-accent shadow-sm" : "border"
                          }`}
                        >
                          <CardContent className="p-0">
                            {/* Header Section */}
                            <div className={`p-4 border-b ${isActive ? "bg-accent/5" : "bg-muted/30"}`}>
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2.5 mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center flex-shrink-0">
                                      <Globe className="w-4 h-4 text-accent" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h3 className="text-base font-semibold text-foreground truncate">
                                        {site.title || "Untitled Site"}
                                      </h3>
                                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                                        {siteUrl}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {isActive && (
                                      <Badge className="bg-accent text-accent-foreground border-0 text-xs px-1.5 py-0.5">
                                        <Check className="w-2.5 h-2.5 mr-1" />
                                        Active
                                      </Badge>
                                    )}
                                    {site.cms_platform ? (
                                      <Badge variant="default" className="bg-blue-600 text-white border-0 text-xs px-1.5 py-0.5">
                                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                                        Connected
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                        Disconnected
                                      </Badge>
                                    )}
                                    {site.onboarding_completed && (
                                      <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800 text-xs px-1.5 py-0.5">
                                        Onboarded
                                      </Badge>
                                    )}
                                    {articleTypesCount > 0 && (
                                      <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                                        {articleTypesCount} Types
                                      </Badge>
                                    )}
                                    {stats.total > 0 && (
                                      <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                                        <FileText className="w-2.5 h-2.5 mr-1" />
                                        {stats.total} Articles
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {/* Primary Actions */}
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleViewDashboard(site.id)}
                                    className="h-8 bg-[#8B7355] hover:bg-[#8B7355]/90 text-white text-xs px-3"
                                  >
                                    <ArrowRight className="w-3 h-3 mr-1.5" />
                                    Dashboard
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      selectSite(site.id);
                                      navigate("/articles");
                                    }}
                                    className="h-8 text-xs px-3"
                                  >
                                    <FileText className="w-3 h-3 mr-1.5" />
                                    Articles
                                  </Button>
                                  
                                  {/* More Actions Dropdown */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                      >
                                        <MoreVertical className="w-4 h-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                      {!isActive && (
                                        <>
                                          <DropdownMenuItem
                                            onClick={() => selectSite(site.id)}
                                          >
                                            <Check className="w-4 h-4 mr-2" />
                                            Set Active
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                        </>
                                      )}
                                      {site.cms_platform && (
                                        <>
                                          <DropdownMenuItem
                                            onClick={() => handleReconnectCMS(site.id)}
                                          >
                                            <WifiOff className="w-4 h-4 mr-2" />
                                            Reconnect CMS
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => handleTestConnection(site)}
                                            disabled={isTesting}
                                          >
                                            {isTesting ? (
                                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                              <Wifi className="w-4 h-4 mr-2" />
                                            )}
                                            Test Connection
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                        </>
                                      )}
                                      <DropdownMenuItem
                                        onClick={() => handleEditSite(site)}
                                      >
                                        <Edit className="w-4 h-4 mr-2" />
                                        Edit Site
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => setDeleteSiteId(site.id)}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete Site
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </div>

                            {/* Details Section */}
                            <div className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Basic Information */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    Information
                                  </h4>
                                  <div className="space-y-2">
                                    {site.company_name && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground w-16">Company:</span>
                                        <span className="text-xs font-medium text-foreground">{site.company_name}</span>
                                      </div>
                                    )}
                                    {site.description && (
                                      <div className="flex items-start gap-2">
                                        <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Desc:</span>
                                        <span className="text-xs text-foreground">{site.description}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {site.subdomain && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs text-muted-foreground">Subdomain:</span>
                                          <span className="text-xs text-foreground font-mono">{site.subdomain}</span>
                                        </div>
                                      )}
                                      {site.custom_domain && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs text-muted-foreground">Domain:</span>
                                          <span className="text-xs text-foreground font-mono">{site.custom_domain}</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                      <span>Created {format(new Date(site.created_at), "MMM d, yyyy")}</span>
                                      {site.last_post_generated_at && (
                                        <span>• Last post {format(new Date(site.last_post_generated_at), "MMM d")}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* CMS & Stats */}
                                <div className="space-y-3">
                                  {site.cms_platform && (
                                    <>
                                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        CMS & Stats
                                      </h4>
                                      <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-muted-foreground w-16">Platform:</span>
                                          <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                                            {getCMSName(site.cms_platform)}
                                          </Badge>
                                          {site.mode && (
                                            <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                                              {site.mode.replace('_', ' ')}
                                            </Badge>
                                          )}
                                        </div>
                                        {site.cms_site_url && (
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">URL:</span>
                                            <a 
                                              href={site.cms_site_url} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-xs text-accent hover:underline truncate flex items-center gap-1"
                                            >
                                              {site.cms_site_url}
                                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                            </a>
                                          </div>
                                        )}
                                        {site.last_sync_at && (
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground w-16">Last Sync:</span>
                                            <span className="text-xs text-foreground">
                                              {format(new Date(site.last_sync_at), "MMM d, h:mm a")}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </>
                                  )}
                                  
                                  {/* Article Statistics - Compact */}
                                  {stats.total > 0 && (
                                    <div className="pt-2 border-t">
                                      <div className="flex items-center gap-3 flex-wrap">
                                        <span className="text-xs text-muted-foreground">Articles:</span>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800">
                                            {stats.published} Published
                                          </Badge>
                                          <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 border-purple-200 dark:border-purple-800">
                                            {stats.scheduled} Scheduled
                                          </Badge>
                                          <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                                            {stats.pending} Pending
                                          </Badge>
                                          {stats.failed > 0 && (
                                            <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                                              {stats.failed} Failed
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Auto-Post Status */}
                                  {site.auto_post_enabled !== null && (
                                    <div className="pt-2 border-t">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-muted-foreground">Auto-Post:</span>
                                        {site.auto_post_enabled ? (
                                          <Badge className="bg-green-600 text-white border-0 text-xs px-1.5 py-0.5">
                                            On
                                          </Badge>
                                        ) : (
                                          <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                            Off
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  )}
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

          <TabsContent value="api-keys" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="w-5 h-5" />
                      API Keys
                    </CardTitle>
                    <CardDescription>
                      Manage API keys for external integrations like Framer plugin
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => setShowCreateKeyModal(true)}
                    className="bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Generate New Key
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Info Box */}
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        About API Keys
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        API keys allow external applications to publish content on your behalf. 
                        Each key can have specific permissions (scopes) and optional expiration dates.
                        Use the <strong>"Publish Only"</strong> preset for the Framer plugin.
                      </p>
                    </div>
                  </div>
                </div>

                {/* API Keys List */}
                {isLoadingApiKeys ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-12">
                    <Key className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">No API keys yet</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Generate an API key to use with the Framer plugin or other integrations.
                    </p>
                    <Button
                      onClick={() => setShowCreateKeyModal(true)}
                      className="bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Generate Your First Key
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((apiKey) => (
                      <div
                        key={apiKey.id}
                        className={`p-4 rounded-lg border ${
                          apiKey.is_active
                            ? 'bg-card border-border'
                            : 'bg-muted/30 border-border/50 opacity-70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium text-foreground">{apiKey.name}</h4>
                              {apiKey.is_revoked && (
                                <Badge variant="destructive" className="text-xs">Revoked</Badge>
                              )}
                              {apiKey.is_expired && !apiKey.is_revoked && (
                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                                  Expired
                                </Badge>
                              )}
                              {apiKey.is_active && (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800">
                                  Active
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                {apiKey.key_prefix}••••••••
                              </code>
                            </div>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {apiKey.scopes.map((scope) => (
                                <Badge key={scope} variant="secondary" className="text-xs">
                                  {getScopeLabel(scope)}
                                </Badge>
                              ))}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>Created {format(new Date(apiKey.created_at), "MMM d, yyyy")}</span>
                              {apiKey.last_used_at && (
                                <span>• Last used {format(new Date(apiKey.last_used_at), "MMM d, h:mm a")}</span>
                              )}
                              {apiKey.expires_at && (
                                <span>• Expires {format(new Date(apiKey.expires_at), "MMM d, yyyy")}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {apiKey.is_active && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setKeyToRevoke(apiKey.id)}
                                disabled={revokingKeyId === apiKey.id}
                                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                              >
                                {revokingKeyId === apiKey.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  "Revoke"
                                )}
                              </Button>
                            )}
                            {!apiKey.is_active && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteApiKey(apiKey.id)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
                <Textarea
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

        {/* Create API Key Dialog */}
        <Dialog open={showCreateKeyModal} onOpenChange={setShowCreateKeyModal}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Generate New API Key
              </DialogTitle>
              <DialogDescription>
                Create a new API key for external integrations. Choose permissions carefully.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">Key Name *</Label>
                <Input
                  id="key-name"
                  value={createKeyForm.name}
                  onChange={(e) => setCreateKeyForm({ ...createKeyForm, name: e.target.value })}
                  placeholder="e.g., Framer Plugin"
                />
                <p className="text-xs text-muted-foreground">
                  A friendly name to identify this key
                </p>
              </div>

              <div className="space-y-2">
                <Label>Permissions *</Label>
                <div className="space-y-2">
                  <div
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      createKeyForm.preset === 'publish_only'
                        ? 'border-[#8B7355] bg-[#8B7355]/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                    onClick={() => setCreateKeyForm({ ...createKeyForm, preset: 'publish_only', customScopes: [] })}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        createKeyForm.preset === 'publish_only' ? 'border-[#8B7355]' : 'border-muted-foreground'
                      }`}>
                        {createKeyForm.preset === 'publish_only' && (
                          <div className="w-2 h-2 rounded-full bg-[#8B7355]" />
                        )}
                      </div>
                      <span className="font-medium text-sm">Publish Only</span>
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                        Recommended
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                      Best for Framer plugin and CMS integrations. Scopes: posts:publish, posts:read
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      createKeyForm.preset === 'read_only'
                        ? 'border-[#8B7355] bg-[#8B7355]/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                    onClick={() => setCreateKeyForm({ ...createKeyForm, preset: 'read_only', customScopes: [] })}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        createKeyForm.preset === 'read_only' ? 'border-[#8B7355]' : 'border-muted-foreground'
                      }`}>
                        {createKeyForm.preset === 'read_only' && (
                          <div className="w-2 h-2 rounded-full bg-[#8B7355]" />
                        )}
                      </div>
                      <span className="font-medium text-sm">Read Only</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                      For analytics and dashboards. Scopes: posts:read, sites:read, keywords:read
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      createKeyForm.preset === 'full_access'
                        ? 'border-[#8B7355] bg-[#8B7355]/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                    onClick={() => setCreateKeyForm({ ...createKeyForm, preset: 'full_access', customScopes: [] })}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        createKeyForm.preset === 'full_access' ? 'border-[#8B7355]' : 'border-muted-foreground'
                      }`}>
                        {createKeyForm.preset === 'full_access' && (
                          <div className="w-2 h-2 rounded-full bg-[#8B7355]" />
                        )}
                      </div>
                      <span className="font-medium text-sm">Full Access</span>
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                        Use with caution
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                      All permissions. Only use if absolutely necessary.
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      createKeyForm.preset === 'custom'
                        ? 'border-[#8B7355] bg-[#8B7355]/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                    onClick={() => setCreateKeyForm({ ...createKeyForm, preset: 'custom' })}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        createKeyForm.preset === 'custom' ? 'border-[#8B7355]' : 'border-muted-foreground'
                      }`}>
                        {createKeyForm.preset === 'custom' && (
                          <div className="w-2 h-2 rounded-full bg-[#8B7355]" />
                        )}
                      </div>
                      <span className="font-medium text-sm">Custom</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                      Select specific scopes
                    </p>
                  </div>

                  {createKeyForm.preset === 'custom' && (
                    <div className="ml-6 p-3 bg-muted/50 rounded-lg space-y-2">
                      {['posts:read', 'posts:write', 'posts:publish', 'sites:read', 'keywords:read', 'keywords:write'].map((scope) => (
                        <label key={scope} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={createKeyForm.customScopes.includes(scope)}
                            onChange={() => toggleCustomScope(scope)}
                            className="rounded border-muted-foreground"
                          />
                          <span className="text-sm">{getScopeLabel(scope)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="key-expiration">Expiration</Label>
                <select
                  id="key-expiration"
                  value={createKeyForm.expiresInDays || ''}
                  onChange={(e) => setCreateKeyForm({ 
                    ...createKeyForm, 
                    expiresInDays: e.target.value ? Number(e.target.value) : null 
                  })}
                  className="w-full p-2 rounded-md border border-input bg-background text-sm"
                >
                  <option value="">Never expires</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreateKeyModal(false)}
                disabled={isCreatingKey}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateApiKey}
                disabled={isCreatingKey || !createKeyForm.name.trim()}
                className="bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
              >
                {isCreatingKey ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Key"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Key Created Success Dialog */}
        <Dialog open={showKeyCreatedModal} onOpenChange={(open) => {
          if (!open) {
            setShowKeyCreatedModal(false);
            setNewKeyData(null);
          }
        }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                API Key Created Successfully
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      Copy this key now!
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      This is the only time you will see this key. Store it securely.
                    </p>
                  </div>
                </div>
              </div>

              {newKeyData && (
                <>
                  <div className="space-y-2">
                    <Label>Your API Key</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                        {newKeyData.key}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(newKeyData.key)}
                        className={keyCopied ? 'text-green-600' : ''}
                      >
                        {keyCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1 text-sm">
                    <p><strong>Name:</strong> {newKeyData.name}</p>
                    <p><strong>Scopes:</strong> {newKeyData.scopes.map(getScopeLabel).join(', ')}</p>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setShowKeyCreatedModal(false);
                  setNewKeyData(null);
                }}
                className="bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
              >
                I've Copied the Key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Revoke API Key Confirmation Dialog */}
        <AlertDialog open={!!keyToRevoke} onOpenChange={(open) => !open && setKeyToRevoke(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                Revoke API Key
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to revoke this API key? Any integrations using this key will 
                immediately stop working. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!revokingKeyId}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => keyToRevoke && handleRevokeApiKey(keyToRevoke)}
                disabled={!!revokingKeyId}
                className="bg-amber-600 text-white hover:bg-amber-700"
              >
                {revokingKeyId ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Revoking...
                  </>
                ) : (
                  "Revoke Key"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
