import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { ArticleTypeSettings } from "@/components/settings/ArticleTypeSettings";
import { canCreateSite, getSiteLimitInfo } from "@/lib/utils/site-limits";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type CMSPlatform =
  | "wordpress"
  | "webflow"
  | "ghost"
  | "shopify"
  | "wix"
  | "framer"
  | "notion"
  | "hubspot"
  | "nextjs"
  | "rest_api";

interface CMSConnection {
  platform: CMSPlatform;
  siteUrl: string;
  apiKey?: string;
  apiSecret?: string;
  storeId?: string;
  accessToken?: string;
  username?: string;
  password?: string;
  accountId?: string; // For Wix Account ID
}

interface BlogOnboardingProps {
  open: boolean;
  onComplete: (blogId?: string) => void;
  onCancel: () => void;
  blogId?: string | null; // Optional: if provided, update existing blog instead of creating new one
}

const CMS_PLATFORMS = [
  { id: "wordpress" as const, name: "WordPress", icon: "🔷", description: "Connect your WordPress site" },
  // { id: "webflow" as const, name: "Webflow", icon: "⚡", description: "Sync with Webflow CMS" },
  // { id: "ghost" as const, name: "Ghost", icon: "👻", description: "Integrate Ghost publishing" },
  { id: "shopify" as const, name: "Shopify", icon: "🛍️", description: "Connect your Shopify store" },
  { id: "wix" as const, name: "WIX", icon: "🌐", description: "Sync with WIX website" },
  { id: "framer" as const, name: "Framer", icon: "🎨", description: "Connect Framer site" },
  // { id: "notion" as const, name: "Notion", icon: "📝", description: "Sync with Notion database" },
  // { id: "hubspot" as const, name: "HubSpot", icon: "🎯", description: "Connect HubSpot CMS" },
  // { id: "nextjs" as const, name: "Next.js", icon: "⚫", description: "Connect Next.js blog" },
  // { id: "rest_api" as const, name: "REST API", icon: "🔌", description: "Custom REST API" },
];

export function BlogOnboarding({ open, onComplete, onCancel, blogId: propBlogId }: BlogOnboardingProps) {
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState<CMSPlatform | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isLoadingExistingData, setIsLoadingExistingData] = useState(false);
  // Set initial step based on whether we're reconnecting
  const [currentStep, setCurrentStep] = useState<"platform" | "connection" | "article-types">(
    propBlogId ? "connection" : "platform",
  );
  const [blogId, setBlogId] = useState<string | null>(propBlogId || null);
  const [siteLimitInfo, setSiteLimitInfo] = useState<{
    limit: number;
    count: number;
    remaining: number;
    canCreate: boolean;
  } | null>(null);
  const [connectionData, setConnectionData] = useState<CMSConnection>({
    platform: "wordpress",
    siteUrl: "",
    apiKey: "",
    apiSecret: "",
  });

  // Check site limit on mount and load existing blog data if reconnecting
  useEffect(() => {
    if (open) {
      checkSiteLimit();
      if (propBlogId) {
        // Pre-load existing data before showing UI to avoid flicker
        loadExistingBlogData(propBlogId);
      } else {
        // Reset state when opening for new site
        setSelectedPlatform(null);
        setCurrentStep("platform");
        setConnectionData({
          platform: "wordpress",
          siteUrl: "",
          apiKey: "",
          apiSecret: "",
        });
        setIsLoadingExistingData(false);
      }
    }
  }, [open, propBlogId]);

  // Load existing blog data for reconnecting
  const loadExistingBlogData = async (id: string) => {
    setIsLoadingExistingData(true);
    try {
      const { data: blog, error } = await supabase
        .from("blogs")
        .select("cms_platform, cms_site_url, title")
        .eq("id", id)
        .single();

      if (error) throw error;

      if (blog.cms_platform) {
        setSelectedPlatform(blog.cms_platform as CMSPlatform);
        setConnectionData((prev) => ({
          ...prev,
          platform: blog.cms_platform as CMSPlatform,
          siteUrl: blog.cms_site_url || "",
        }));
        // Step is already set to "connection" initially when propBlogId exists
      }
    } catch (error) {
      console.error("Error loading blog data:", error);
      toast.error("Failed to load site information");
      // Fallback to platform selection if loading fails
      setCurrentStep("platform");
    } finally {
      setIsLoadingExistingData(false);
    }
  };

  const checkSiteLimit = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const info = await getSiteLimitInfo(user.id);
      setSiteLimitInfo(info);
    } catch (error) {
      console.error("Error checking site limit:", error);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedPlatform || !connectionData.siteUrl) {
      toast.error("Please enter your site URL");
      return;
    }

    // Add https:// if no protocol is specified
    const formattedUrl = connectionData.siteUrl.trim().match(/^https?:\/\//)
      ? connectionData.siteUrl.trim()
      : `https://${connectionData.siteUrl.trim()}`;

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-cms-connection", {
        body: {
          platform: selectedPlatform,
          ...connectionData,
          siteUrl: formattedUrl,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Connection successful!");
        // Update the URL with the formatted version
        setConnectionData({ ...connectionData, siteUrl: formattedUrl });
      } else {
        toast.error(data.error || "Failed to connect");
      }
    } catch (error: any) {
      console.error("Connection test error:", error);
      toast.error("Failed to test connection: " + error.message);
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedPlatform || !connectionData.siteUrl) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check site limit only when creating new blog (not reconnecting)
      if (!propBlogId) {
        const canCreate = await canCreateSite(user.id);
        if (!canCreate) {
          toast.error("You've reached your site limit. Please upgrade your plan to add more sites.");
          navigate("/plans");
          setLoading(false);
          return;
        }
      }

      // Add https:// if no protocol is specified
      const formattedUrl = connectionData.siteUrl.trim().match(/^https?:\/\//)
        ? connectionData.siteUrl.trim()
        : `https://${connectionData.siteUrl.trim()}`;

      // Only check for duplicate URLs when creating a new site (not reconnecting)
      if (!propBlogId) {
        // Normalize URL for comparison (remove trailing slash, convert to lowercase)
        const normalizedUrl = formattedUrl.toLowerCase().replace(/\/$/, "");

        // Check if a site with the same URL already exists for this user
        const { data: existingSites, error: checkError } = await supabase
          .from("blogs")
          .select("id, website_homepage, cms_site_url, title")
          .eq("user_id", user.id);

        if (checkError) {
          console.error("Error checking for existing sites:", checkError);
          throw new Error("Failed to verify site URL");
        }

        // Check if URL already exists (check both website_homepage and cms_site_url)
        const urlExists = existingSites?.some((site) => {
          const existingHomepage = site.website_homepage?.toLowerCase().replace(/\/$/, "");
          const existingCmsUrl = site.cms_site_url?.toLowerCase().replace(/\/$/, "");
          return existingHomepage === normalizedUrl || existingCmsUrl === normalizedUrl;
        });

        if (urlExists) {
          const existingSite = existingSites?.find((site) => {
            const existingHomepage = site.website_homepage?.toLowerCase().replace(/\/$/, "");
            const existingCmsUrl = site.cms_site_url?.toLowerCase().replace(/\/$/, "");
            return existingHomepage === normalizedUrl || existingCmsUrl === normalizedUrl;
          });

          toast.error(
            `A site with this URL already exists: ${existingSite?.title || "Untitled Site"}. ` +
              `Please use a different URL or edit the existing site from Settings.`,
          );
          setLoading(false);
          return;
        }
      }

      // Extract site name from URL for title
      const siteName = new URL(formattedUrl).hostname.split(".")[0];

      // Prepare credentials based on platform
      let credentials = {};
      if (selectedPlatform === "wordpress") {
        credentials = {
          username: connectionData.username,
          password: connectionData.password,
        };
      } else if (selectedPlatform === "shopify") {
        if (!connectionData.accessToken) {
          toast.error("Please provide your Shopify Admin API access token");
          return;
        }
        credentials = {
          access_token: connectionData.accessToken,
        };
      } else if (selectedPlatform === "framer") {
        // Framer only needs URL, use empty credentials object
        credentials = { connected: true };
      } else if (selectedPlatform === "wix") {
        if (!connectionData.apiKey || !connectionData.apiSecret || !connectionData.accountId) {
          toast.error("Please provide API Key, Site ID, and Account ID");
          return;
        }
        credentials = {
          apiKey: connectionData.apiKey,
          siteId: connectionData.apiSecret,
          accountId: connectionData.accountId,
        };
      } else {
        credentials = {
          apiKey: connectionData.apiKey,
          apiSecret: connectionData.apiSecret,
          accessToken: connectionData.accessToken,
          storeId: connectionData.storeId,
        };
      }

      // 🔒 Encrypt credentials before saving
      let encryptedCredentials: string;
      try {
        const { data: encryptResult, error: encryptError } = await supabase.functions.invoke("encrypt-credentials", {
          body: { credentials },
        });

        if (encryptError) {
          console.error("Encryption error:", encryptError);
          // Fallback to plaintext if encryption fails (backward compatibility)
          encryptedCredentials = JSON.stringify(credentials);
          console.warn("⚠️ Storing credentials in plaintext (encryption failed)");
        } else {
          encryptedCredentials = encryptResult.encrypted;
        }
      } catch (error) {
        console.error("Failed to encrypt credentials:", error);
        // Fallback to plaintext if encryption fails (backward compatibility)
        encryptedCredentials = JSON.stringify(credentials);
        console.warn("⚠️ Storing credentials in plaintext (encryption unavailable)");
      }

      // If reconnecting, update existing blog; otherwise create new one
      if (propBlogId) {
        // Update existing blog with new CMS credentials
        const updateData = {
          cms_platform: selectedPlatform,
          cms_site_url: formattedUrl,
          cms_credentials: encryptedCredentials,
          last_sync_at: new Date().toISOString(),
        };

        const { error } = await supabase.from("blogs").update(updateData).eq("id", propBlogId);

        if (error) throw error;

        toast.success("CMS reconnected successfully!");
        setBlogId(propBlogId);
      } else {
        // Create new blog
        const siteName = new URL(formattedUrl).hostname.split(".")[0];
        const blogData = {
          mode: "existing_site",
          subdomain: null,
          title: siteName.charAt(0).toUpperCase() + siteName.slice(1),
          description: `Connected ${selectedPlatform} site`,
          company_name: siteName,
          website_homepage: formattedUrl,
          onboarding_completed: true,
          is_published: true,
          cms_platform: selectedPlatform,
          cms_site_url: formattedUrl,
          cms_credentials: encryptedCredentials,
        };

        const { data: resultData, error } = await supabase
          .from("blogs")
          .insert({
            user_id: user.id,
            ...blogData,
          })
          .select()
          .single();

        if (error) throw error;

        toast.success("CMS connected successfully!");
        setBlogId(resultData.id);
      }

      // Automatically generate the first article only for new sites
      if (!propBlogId && blogId) {
        toast.info("Generating your first article...");
        try {
          await supabase.functions.invoke("generate-blog-post", {
            body: { blogId: blogId },
          });
          toast.success("First article generated! Check your dashboard.");
        } catch (genError) {
          console.error("Error generating first article:", genError);
          toast.error("CMS connected but article generation failed. You can generate articles from the Articles page.");
        }
      }

      setCurrentStep("article-types");
    } catch (error: any) {
      toast.error("Failed to connect CMS: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleArticleTypesSaved = () => {
    toast.success("Article preferences saved!");
    // Pass the blogId to onComplete so the parent can set it as active
    if (blogId) {
      onComplete(blogId);
    } else {
      onComplete();
    }
  };

  const renderConnectionForm = () => {
    if (!selectedPlatform) return null;

    const platform = CMS_PLATFORMS.find((p) => p.id === selectedPlatform);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (propBlogId) {
                // When reconnecting, go back to sites tab
                onCancel();
                navigate("/settings?tab=sites");
              } else {
                // When creating new site, go back to platform selection
                setSelectedPlatform(null);
                setCurrentStep("platform");
              }
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{platform?.icon}</span>
            <h2 className="text-2xl font-bold text-foreground">Connect {platform?.name}</h2>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="siteUrl">Site URL *</Label>
            <Input
              id="siteUrl"
              type="text"
              placeholder="yourdomain.com or https://yourdomain.com"
              value={connectionData.siteUrl}
              onChange={(e) => setConnectionData({ ...connectionData, siteUrl: e.target.value })}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enter your site URL (https:// will be added automatically if needed)
            </p>
          </div>

          {selectedPlatform === "wordpress" && (
            <>
              <div>
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your WordPress username"
                  value={connectionData.username || ""}
                  onChange={(e) => setConnectionData({ ...connectionData, username: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Your WordPress admin username</p>
              </div>
              <div>
                <Label htmlFor="password">Application Password *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your application password"
                  value={connectionData.password || ""}
                  onChange={(e) => setConnectionData({ ...connectionData, password: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Generate from WordPress admin → Users → Your Profile → Application Passwords
                </p>
              </div>
            </>
          )}

          {(selectedPlatform === "ghost" || selectedPlatform === "rest_api") && (
            <div>
              <Label htmlFor="apiKey">API Key *</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your API key"
                value={connectionData.apiKey}
                onChange={(e) => setConnectionData({ ...connectionData, apiKey: e.target.value })}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {selectedPlatform === "ghost" && "Find in Ghost admin → Integrations → Add custom integration"}
                {selectedPlatform === "rest_api" && "Your custom API authentication key"}
              </p>
            </div>
          )}

          {selectedPlatform === "webflow" && (
            <div>
              <Label htmlFor="accessToken">Access Token *</Label>
              <Input
                id="accessToken"
                type="password"
                placeholder="Enter your Webflow access token"
                value={connectionData.accessToken}
                onChange={(e) => setConnectionData({ ...connectionData, accessToken: e.target.value })}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Generate from Webflow → Account Settings → API Access
              </p>
            </div>
          )}

          {selectedPlatform === "shopify" && (
            <>
              <div>
                <Label htmlFor="accessToken">Admin API Access Token *</Label>
                <Input
                  id="accessToken"
                  type="password"
                  placeholder="Enter your Admin API access token"
                  value={connectionData.accessToken}
                  onChange={(e) => setConnectionData({ ...connectionData, accessToken: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Get this from Shopify Admin → Apps → Develop apps → Create an app → API credentials
                </p>
              </div>
              <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">How to get your access token:</h4>
                <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Go to Shopify admin → Apps → Develop apps</li>
                  <li>Click "Create an app"</li>
                  <li>Name it (e.g., "SearchFuel Integration")</li>
                  <li>
                    Under "Configure Admin API access", enable:
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li>read_content, write_content (for blog posts)</li>
                      <li>read_files, write_files (for images)</li>
                    </ul>
                  </li>
                  <li>Install the app in your store</li>
                  <li>Copy the "Admin API access token"</li>
                </ol>
              </div>
            </>
          )}

          {(selectedPlatform === "notion" || selectedPlatform === "hubspot") && (
            <div>
              <Label htmlFor="accessToken">Access Token *</Label>
              <Input
                id="accessToken"
                type="password"
                placeholder={`Enter your ${platform?.name} access token`}
                value={connectionData.accessToken}
                onChange={(e) => setConnectionData({ ...connectionData, accessToken: e.target.value })}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {selectedPlatform === "notion" && "Create an integration at notion.so/my-integrations"}
                {selectedPlatform === "hubspot" && "Generate from HubSpot → Settings → Integrations → API Key"}
              </p>
            </div>
          )}

          {selectedPlatform === "framer" && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-800 dark:text-green-200">
                ✓ Framer connection only requires your website URL. Click "Continue" to proceed.
              </p>
            </div>
          )}

          {selectedPlatform === "wix" && (
            <>
              <div>
                <Label htmlFor="apiKey">API Key *</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="Enter your Wix API Key"
                  value={connectionData.apiKey}
                  onChange={(e) => setConnectionData({ ...connectionData, apiKey: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Get from Wix Dashboard → Settings → API Keys
                </p>
              </div>
              <div>
                <Label htmlFor="siteId">Site ID *</Label>
                <Input
                  id="siteId"
                  type="text"
                  placeholder="Enter your Wix Site ID"
                  value={connectionData.apiSecret}
                  onChange={(e) => setConnectionData({ ...connectionData, apiSecret: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Found in Wix Dashboard → Settings → Site Properties
                </p>
              </div>
              <div>
                <Label htmlFor="accountId">Account ID *</Label>
                <Input
                  id="accountId"
                  type="text"
                  placeholder="Enter your Wix Account ID"
                  value={connectionData.accountId}
                  onChange={(e) => setConnectionData({ ...connectionData, accountId: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Found in Wix Dashboard → Settings → Site Properties (Account ID)
                </p>
              </div>
              <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">How to get your credentials:</h4>
                <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Go to your Wix Dashboard → Settings</li>
                  <li>Navigate to "API Keys" and create a new key</li>
                  <li>Grant "Wix Blog" read & write permissions</li>
                  <li>Copy your Site ID and Account ID from Settings → Site Properties</li>
                </ol>
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>Note:</strong> Your site must have the Wix Blog app installed.
                </p>
              </div>
            </>
          )}

          {/* Connection Steps Info */}
          <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-semibold text-foreground mb-2">Connection Steps:</h4>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Enter your site URL (e.g., yourdomain.com)</li>
              <li>Provide required credentials (API keys/tokens)</li>
              <li>Test the connection to verify credentials</li>
              <li>Click "Continue" to select article types</li>
            </ol>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={handleTestConnection} disabled={testing || !connectionData.siteUrl}>
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                "Test Connection"
              )}
            </Button>
            <Button onClick={handleConnect} disabled={loading || !connectionData.siteUrl} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Article Types Step
  if (currentStep === "article-types" && blogId) {
    return (
      <Card className="p-8 bg-card max-w-4xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-2">Select Article Types</h2>
          <p className="text-muted-foreground">
            Choose the content formats that best fit your audience. You can change this anytime in settings.
          </p>
        </div>
        <ArticleTypeSettings blogId={blogId} isOnboarding={true} onSave={handleArticleTypesSaved} />
      </Card>
    );
  }

  // Show loading state when reconnecting and loading existing data
  if (isLoadingExistingData && propBlogId) {
    return (
      <Card className="p-8 bg-card max-w-4xl">
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
            <p className="text-sm text-muted-foreground">Loading site information...</p>
          </div>
        </div>
      </Card>
    );
  }

  // Connection Form Step - show if we're on connection step and have platform, or if reconnecting
  if ((currentStep === "connection" && selectedPlatform) || (propBlogId && selectedPlatform)) {
    return <Card className="p-8 bg-card max-w-2xl">{renderConnectionForm()}</Card>;
  }

  // Platform Selection Step - only show for new sites
  if (!propBlogId) {
    return (
      <Card className="p-8 bg-card max-w-4xl">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">Connect Your CMS</h2>
          <p className="text-muted-foreground">
            Choose your platform to automatically sync and publish SEO-optimized content
          </p>
        </div>

        {/* Site Limit Warning */}
        {siteLimitInfo && !siteLimitInfo.canCreate && (
          <Alert className="mb-6 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">Site Limit Reached</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              You've reached your site limit ({siteLimitInfo.count} of {siteLimitInfo.limit} sites). Please upgrade your
              plan to add more sites.
              <Button
                variant="link"
                className="p-0 h-auto ml-2 text-amber-700 dark:text-amber-300 underline"
                onClick={() => {
                  onCancel();
                  navigate("/plans");
                }}
              >
                Upgrade Now →
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {siteLimitInfo && siteLimitInfo.remaining > 0 && (
          <Alert className="mb-6 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              You can add {siteLimitInfo.remaining} more {siteLimitInfo.remaining === 1 ? "site" : "sites"} (
              {siteLimitInfo.count} of {siteLimitInfo.limit} used).
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-10">
          {CMS_PLATFORMS.map((platform) => (
            <button
              key={platform.id}
              onClick={() => {
                setSelectedPlatform(platform.id);
                setConnectionData({ ...connectionData, platform: platform.id });
                setCurrentStep("connection");
              }}
              className="p-4 rounded-lg border-2 border-border hover:border-accent transition-all bg-card hover:bg-accent/5 flex flex-col items-center gap-2 text-center"
            >
              <span className="text-3xl">{platform.icon}</span>
              <span className="text-sm font-medium text-foreground">{platform.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 flex justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  // Fallback: if reconnecting but no platform loaded, show error
  return (
    <Card className="p-8 bg-card max-w-4xl">
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Failed to load site information</p>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}
