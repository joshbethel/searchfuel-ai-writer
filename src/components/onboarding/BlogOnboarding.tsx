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
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ExternalLink } from "lucide-react";

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

type OnboardingStep = 
  | "website-url"      // NEW: Step 1 - Business Website URL
  | "business-info"    // NEW: Step 2 - Business Information
  | "competitors"       // ENHANCED: Step 3 - Competitors
  | "cms-connection"   // ENHANCED: Step 4 - CMS (Optional)
  | "article-types"    // UNCHANGED: Step 5 - Article Types
  | "platform"         // Legacy: For reconnecting existing sites
  | "connection";      // Legacy: For reconnecting existing sites

interface BusinessInfo {
  company_name: string;
  company_description: string;
  industry: string;
  target_audience: string;
}

export function BlogOnboarding({ open, onComplete, onCancel, blogId: propBlogId }: BlogOnboardingProps) {
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState<CMSPlatform | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isLoadingExistingData, setIsLoadingExistingData] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Set initial step based on whether we're reconnecting
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    propBlogId ? "connection" : "website-url",
  );
  
  // NEW: Business website URL (Step 1)
  const [businessWebsiteUrl, setBusinessWebsiteUrl] = useState("");
  
  // NEW: Business information (Step 2)
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({
    company_name: "",
    company_description: "",
    industry: "",
    target_audience: "",
  });
  
  const [competitors, setCompetitors] = useState<Array<{ domain: string; name?: string }>>([]);
  const [newCompetitorDomain, setNewCompetitorDomain] = useState("");
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
        // Reset state when opening for new site - start with website URL
        setSelectedPlatform(null);
        setCurrentStep("website-url");
        setBusinessWebsiteUrl("");
        setBusinessInfo({
          company_name: "",
          company_description: "",
          industry: "",
          target_audience: "",
        });
        setCompetitors([]);
        setConnectionData({
          platform: "wordpress",
          siteUrl: "",
          apiKey: "",
          apiSecret: "",
        });
        setIsLoadingExistingData(false);
        setIsAnalyzing(false);
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

  // NEW: Handle business website URL step (Step 1)
  const handleBusinessWebsiteContinue = async () => {
    if (!businessWebsiteUrl.trim()) {
      toast.error("Please enter your business website URL");
      return;
    }

    // Format URL
    const formattedUrl = businessWebsiteUrl.trim().match(/^https?:\/\//)
      ? businessWebsiteUrl.trim()
      : `https://${businessWebsiteUrl.trim()}`;

    // Validate URL
    try {
      new URL(formattedUrl);
    } catch {
      toast.error("Please enter a valid URL (e.g., yourbusiness.com)");
      return;
    }

    // Check for duplicate website_homepage
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const normalizedUrl = formattedUrl.toLowerCase().replace(/\/$/, "");
      const { data: existingSites, error: checkError } = await supabase
        .from("blogs")
        .select("id, website_homepage, title")
        .eq("user_id", user.id);

      if (checkError) {
        console.error("Error checking for existing sites:", checkError);
      } else {
        const urlExists = existingSites?.some((site) => {
          const existingHomepage = site.website_homepage?.toLowerCase().replace(/\/$/, "");
          return existingHomepage === normalizedUrl;
        });

        if (urlExists) {
          const existingSite = existingSites?.find((site) => {
            const existingHomepage = site.website_homepage?.toLowerCase().replace(/\/$/, "");
            return existingHomepage === normalizedUrl;
          });

          toast.error(
            `A site with this website URL already exists: ${existingSite?.title || "Untitled Site"}. ` +
              `Please use a different URL or edit the existing site from Settings.`,
          );
          return;
        }
      }
    } catch (error: any) {
      console.error("Error checking URL:", error);
      toast.error("Failed to verify URL");
      return;
    }

    // Call analyze-website function
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-website", {
        body: { url: formattedUrl },
      });

      if (error) throw error;

      if (data?.success && data?.businessInfo) {
        // Auto-populate business info with extracted data
        setBusinessInfo({
          company_name: data.businessInfo.company_name || "",
          company_description: data.businessInfo.company_description || "",
          industry: data.businessInfo.industry || "",
          target_audience: "",
        });

        // Auto-populate competitors if available
        if (data.competitors && Array.isArray(data.competitors) && data.competitors.length > 0) {
          setCompetitors(data.competitors);
        }

        toast.success("Website analyzed successfully!");
      } else {
        // Fallback: extract basic info from URL if analysis fails
        const hostname = new URL(formattedUrl).hostname;
        const siteName = hostname.split(".")[0];
        
        setBusinessInfo({
          company_name: siteName.charAt(0).toUpperCase() + siteName.slice(1),
          company_description: "",
          industry: "",
          target_audience: "",
        });
      }
    } catch (error: any) {
      console.error("Error analyzing website:", error);
      // Fallback: extract basic info from URL
      const hostname = new URL(formattedUrl).hostname;
      const siteName = hostname.split(".")[0];
      
      setBusinessInfo({
        company_name: siteName.charAt(0).toUpperCase() + siteName.slice(1),
        company_description: "",
        industry: "",
        target_audience: "",
      });
      
      toast.error("Could not analyze website automatically. Please fill in the information manually.");
    } finally {
      setIsAnalyzing(false);
    }

    // Navigate to business info step
    setCurrentStep("business-info");
  };

  // NEW: Handle business information step (Step 2)
  const handleBusinessInfoContinue = async () => {
    if (!businessInfo.company_name.trim()) {
      toast.error("Please enter your company name");
      return;
    }

    if (!businessInfo.company_description.trim()) {
      toast.error("Please enter a company description");
      return;
    }

    // Check site limit
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const canCreate = await canCreateSite(user.id);
      if (!canCreate) {
        toast.error("You've reached your site limit. Please upgrade your plan to add more sites.");
        navigate("/plans");
        return;
      }

      // Format business website URL
      const formattedUrl = businessWebsiteUrl.trim().match(/^https?:\/\//)
        ? businessWebsiteUrl.trim()
        : `https://${businessWebsiteUrl.trim()}`;

      // Extract site name from URL for title
      const siteName = new URL(formattedUrl).hostname.split(".")[0];

      // Create blog with business information (no CMS yet)
      const blogData = {
        mode: "existing_site",
        subdomain: null,
        title: businessInfo.company_name || siteName.charAt(0).toUpperCase() + siteName.slice(1),
        description: businessInfo.company_description,
        company_name: businessInfo.company_name,
        company_description: businessInfo.company_description,
        industry: businessInfo.industry || null,
        target_audience: businessInfo.target_audience || null,
        website_homepage: formattedUrl,
        cms_platform: null, // CMS not connected yet
        cms_site_url: null,
        cms_credentials: null,
        onboarding_completed: false, // Not completed until CMS or skip
        is_published: true,
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

      toast.success("Site created! Now let's add competitors.");
      setBlogId(resultData.id);
      setCurrentStep("competitors");
    } catch (error: any) {
      console.error("Error creating site:", error);
      toast.error("Failed to create site: " + error.message);
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

      // If reconnecting (propBlogId exists), update existing blog
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
        setCurrentStep("article-types");
      } else if (blogId) {
        // Update existing blog (created in business info step) with CMS connection
        const updateData = {
          cms_platform: selectedPlatform,
          cms_site_url: formattedUrl,
          cms_credentials: encryptedCredentials,
          onboarding_completed: true,
          last_sync_at: new Date().toISOString(),
        };

        const { error } = await supabase.from("blogs").update(updateData).eq("id", blogId);

        if (error) throw error;

        toast.success("CMS connected successfully!");
        setCurrentStep("article-types");
      } else {
        // Legacy: Create new blog (shouldn't happen in new flow, but keep for backward compatibility)
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
        setCurrentStep("article-types");
      }

      // Note: Article generation will happen after article types are configured
      // (removed from here to allow user to configure article types first)
    } catch (error: any) {
      toast.error("Failed to connect CMS: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleArticleTypesSaved = async () => {
    toast.success("Article preferences saved!");
    
    // Mark onboarding as completed
    if (blogId) {
      try {
        const { error } = await supabase
          .from("blogs")
          .update({
            onboarding_completed: true,
          })
          .eq("id", blogId);

        if (error) {
          console.error("Error completing onboarding:", error);
        }
      } catch (error) {
        console.error("Error completing onboarding:", error);
      }
    }
    
    // Complete onboarding
    if (blogId) {
      onComplete(blogId);
    } else {
      onComplete();
    }
  };

  const validateDomain = (domain: string): boolean => {
    const cleaned = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(cleaned);
  };

  const handleAddCompetitor = () => {
    if (!newCompetitorDomain.trim()) {
      toast.error("Please enter a competitor domain");
      return;
    }

    if (competitors.length >= 7) {
      toast.error("Maximum 7 competitors allowed");
      return;
    }

    let cleanedDomain = newCompetitorDomain.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    if (!validateDomain(cleanedDomain)) {
      toast.error("Please enter a valid domain (e.g., competitor.com)");
      return;
    }

    if (competitors.some(c => c.domain.toLowerCase() === cleanedDomain.toLowerCase())) {
      toast.error("This competitor is already added");
      return;
    }

    setCompetitors([...competitors, { domain: cleanedDomain, name: cleanedDomain }]);
    setNewCompetitorDomain("");
  };

  const handleRemoveCompetitor = (index: number) => {
    setCompetitors(competitors.filter((_, i) => i !== index));
  };

  const handleCompetitorsContinue = async () => {
    if (!blogId) {
      onComplete();
      return;
    }

    try {
      // Save competitors to the blog
      const { error } = await supabase
        .from("blogs")
        .update({
          competitors: competitors as any,
        })
        .eq("id", blogId);

      if (error) throw error;

      if (competitors.length > 0) {
        toast.success("Competitors saved!");
      }
      
      // Navigate to CMS connection step (optional)
      setCurrentStep("cms-connection");
    } catch (error: any) {
      console.error("Error saving competitors:", error);
      toast.error("Failed to save competitors, but continuing...");
      // Continue to CMS step anyway
      setCurrentStep("cms-connection");
    }
  };

  const handleSkipCompetitors = () => {
    // Skip competitors and go to CMS step
    setCurrentStep("cms-connection");
  };

  // NEW: Handle skipping CMS connection
  const handleSkipCMS = async () => {
    if (!blogId) {
      onComplete();
      return;
    }

    try {
      // Mark onboarding as completed without CMS
      const { error } = await supabase
        .from("blogs")
        .update({
          onboarding_completed: true,
        })
        .eq("id", blogId);

      if (error) throw error;

      toast.success("Site setup complete! You can connect your CMS later from Settings.");
      onComplete(blogId);
    } catch (error: any) {
      console.error("Error completing onboarding:", error);
      toast.error("Failed to complete setup");
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
                // When creating new site, go back to CMS platform selection
                setSelectedPlatform(null);
                setCurrentStep("cms-connection");
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
            {!propBlogId && (
              <Button variant="outline" onClick={handleSkipCMS} className="flex-1">
                Skip
              </Button>
            )}
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

  // Step 1: Business Website URL
  if (currentStep === "website-url" && !propBlogId) {
    return (
      <Card className="p-8 bg-card max-w-2xl">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to SearchFuel</h2>
          <p className="text-muted-foreground">
            Let's start by understanding your business. Enter your website URL and we'll help you get started.
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

        <div className="space-y-4">
          <div>
            <Label htmlFor="businessWebsite">Business Website URL *</Label>
            <Input
              id="businessWebsite"
              type="text"
              placeholder="yourbusiness.com or https://yourbusiness.com"
              value={businessWebsiteUrl}
              onChange={(e) => setBusinessWebsiteUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && businessWebsiteUrl.trim()) {
                  handleBusinessWebsiteContinue();
                }
              }}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enter your main business website URL. We'll use this to understand your business and generate relevant content.
            </p>
          </div>

          <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              💡 <strong>Tip:</strong> This is your business website (e.g., yourbusiness.com). 
              You can connect your CMS/blog platform later if it's different.
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleBusinessWebsiteContinue} 
              disabled={!businessWebsiteUrl.trim() || isAnalyzing}
              className="flex-1"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // Step 2: Business Information
  if (currentStep === "business-info" && !propBlogId) {
    return (
      <Card className="p-8 bg-card max-w-2xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentStep("website-url")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h2 className="text-2xl font-bold text-foreground mb-2">Business Information</h2>
          <p className="text-muted-foreground">
            Tell us about your business. We've pre-filled some information based on your website.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="companyName">Company Name *</Label>
            <Input
              id="companyName"
              type="text"
              placeholder="Your Company Name"
              value={businessInfo.company_name}
              onChange={(e) => setBusinessInfo({ ...businessInfo, company_name: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="companyDescription">Company Description *</Label>
            <textarea
              id="companyDescription"
              rows={4}
              placeholder="Describe what your business does, your products/services, and your target market..."
              value={businessInfo.company_description}
              onChange={(e) => setBusinessInfo({ ...businessInfo, company_description: e.target.value })}
              className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This helps us understand your business and generate relevant content.
            </p>
          </div>

          <div>
            <Label htmlFor="industry">Industry (Optional)</Label>
            <Input
              id="industry"
              type="text"
              placeholder="e.g., SaaS, E-commerce, Healthcare, Technology"
              value={businessInfo.industry}
              onChange={(e) => setBusinessInfo({ ...businessInfo, industry: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="targetAudience">Target Audience (Optional)</Label>
            <Input
              id="targetAudience"
              type="text"
              placeholder="e.g., Small business owners, Developers, Marketing professionals"
              value={businessInfo.target_audience}
              onChange={(e) => setBusinessInfo({ ...businessInfo, target_audience: e.target.value })}
              className="mt-1"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setCurrentStep("website-url")} className="flex-1">
              Back
            </Button>
            <Button onClick={handleBusinessInfoContinue} className="flex-1" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // Competitors Step
  if (currentStep === "competitors" && blogId) {
    return (
      <Card className="p-8 bg-card max-w-4xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentStep("business-info")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h2 className="text-2xl font-bold text-foreground mb-2">Audience & Competitors</h2>
          <p className="text-muted-foreground mb-4">
            Understanding your audience and competition ensures we generate the most effective keywords. 
            You can add more later in Settings.
          </p>
        </div>

        <div className="space-y-6">
          {/* Competitors Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Competitors ({competitors.length}/7)</Label>
              {competitors.length < 7 && (
                <span className="text-sm text-muted-foreground">
                  Optional: Add competitors to improve keyword analysis
                </span>
              )}
            </div>
            
            {competitors.length > 0 && (
              <div className="space-y-3">
                {competitors.map((competitor, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between p-4 border rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                      <code className="text-sm">{competitor.domain}</code>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveCompetitor(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Competitor Form */}
            {competitors.length < 7 && (
              <div className="space-y-3 p-4 border rounded-lg border-dashed">
                <h4 className="text-sm font-medium">Add Competitor</h4>
                
                <div className="space-y-2">
                  <Label htmlFor="new-competitor">Competitor Domain</Label>
                  <Input
                    id="new-competitor"
                    placeholder="competitor.com"
                    value={newCompetitorDomain}
                    onChange={(e) => setNewCompetitorDomain(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCompetitor();
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the domain of a competitor website (e.g., competitor.com)
                  </p>
                </div>

                <Button onClick={handleAddCompetitor} variant="outline" className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Competitor
                </Button>
              </div>
            )}

            {competitors.length >= 7 && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Maximum 7 competitors reached. Remove one to add another.
                </p>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <h4 className="text-sm font-medium">How It Works</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• System analyzes competitor content to find relevant keywords</li>
              <li>• Competitor analysis improves keyword recommendations</li>
              <li>• System also uses SERP data to find additional competitors</li>
              <li>• You can add or change competitors anytime in Settings</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={handleSkipCompetitors} className="flex-1">
              Skip for Now
            </Button>
            <Button onClick={handleCompetitorsContinue} className="flex-1">
              Continue
            </Button>
          </div>
        </div>
      </Card>
    );
  }

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

  // CMS Connection Step (Step 4) - Platform Selection with Skip option
  if (currentStep === "cms-connection" && !selectedPlatform && !propBlogId) {
    return (
      <Card className="p-8 bg-card max-w-4xl">
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentStep("competitors")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h2 className="text-2xl font-bold text-foreground mb-2">Connect Your CMS (Optional)</h2>
          <p className="text-muted-foreground">
            Connect your CMS now to enable automatic publishing, or skip and connect later from Settings.
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
                setCurrentStep(currentStep === "cms-connection" ? "connection" : "connection");
              }}
              className="p-4 rounded-lg border-2 border-border hover:border-accent transition-all bg-card hover:bg-accent/5 flex flex-col items-center gap-2 text-center"
            >
              <span className="text-3xl">{platform.icon}</span>
              <span className="text-sm font-medium text-foreground">{platform.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" onClick={handleSkipCMS}>
            Skip & Continue
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  // Legacy: Platform Selection Step - only show for reconnecting or legacy flow
  if (!propBlogId && currentStep === "platform") {
    return (
      <Card className="p-8 bg-card max-w-4xl">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">Connect Your CMS</h2>
          <p className="text-muted-foreground">
            Choose your platform to automatically sync and publish SEO-optimized content
          </p>
        </div>

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
