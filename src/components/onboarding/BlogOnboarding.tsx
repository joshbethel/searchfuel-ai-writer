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
import { Plus, Trash2, ExternalLink, Check } from "lucide-react";
import { useSiteContext } from "@/contexts/SiteContext";
import { cn } from "@/lib/utils";

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
  const { refreshSites } = useSiteContext();
  const [selectedPlatform, setSelectedPlatform] = useState<CMSPlatform | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isLoadingExistingData, setIsLoadingExistingData] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>("");
  const [isSavingBusinessInfo, setIsSavingBusinessInfo] = useState(false);
  
  // Set initial step based on whether we're reconnecting
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    propBlogId ? "cms-connection" : "website-url",
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
  const [websiteExists, setWebsiteExists] = useState(false);

  // Define onboarding steps for the stepper
  const onboardingSteps = [
    { id: "website-url", label: "Website URL", number: 1 },
    { id: "business-info", label: "Business Info", number: 2 },
    { id: "competitors", label: "Competitors", number: 3 },
    { id: "cms-connection", label: "CMS Connection", number: 4, optional: true },
    { id: "article-types", label: "Article Types", number: 5 },
  ];

  // Get current step index
  const getCurrentStepIndex = () => {
    return onboardingSteps.findIndex(step => step.id === currentStep);
  };

  // Check if a step is completed
  const isStepCompleted = (stepId: string) => {
    const currentIndex = getCurrentStepIndex();
    const stepIndex = onboardingSteps.findIndex(step => step.id === stepId);
    return stepIndex < currentIndex;
  };

  // Check if a step is accessible (can navigate to it)
  const isStepAccessible = (stepId: string) => {
    // When reconnecting, only allow navigation to the current step (CMS connection)
    if (propBlogId) {
      return stepId === currentStep;
    }
    // Can navigate to completed steps or current step
    return isStepCompleted(stepId) || stepId === currentStep;
  };

  // Stepper component
  const OnboardingStepper = () => {
    const currentIndex = getCurrentStepIndex();
    const progress = ((currentIndex + 1) / onboardingSteps.length) * 100;

    return (
      <div className="mb-8">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              Step {currentIndex + 1} of {onboardingSteps.length}
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-between relative">
          {/* Connector lines */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-border -z-10">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(currentIndex / (onboardingSteps.length - 1)) * 100}%` }}
            />
          </div>

          {onboardingSteps.map((step, index) => {
            const isCompleted = isStepCompleted(step.id);
            const isCurrent = step.id === currentStep;
            const isAccessible = isStepAccessible(step.id);

            return (
              <div
                key={step.id}
                className="flex flex-col items-center flex-1 relative z-10"
              >
                {/* Step circle */}
                <button
                  type="button"
                  onClick={() => {
                    if (isAccessible && step.id !== currentStep) {
                      setCurrentStep(step.id as OnboardingStep);
                    }
                  }}
                  disabled={!isAccessible}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-200",
                    isCurrent && "border-primary bg-primary text-primary-foreground scale-110",
                    isCompleted && !isCurrent && "border-primary bg-primary text-primary-foreground",
                    !isCompleted && !isCurrent && "border-muted-foreground/30 bg-background text-muted-foreground",
                    isAccessible && !isCurrent && "hover:scale-105 cursor-pointer",
                    !isAccessible && "cursor-not-allowed opacity-50"
                  )}
                >
                  {isCompleted && !isCurrent ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-semibold">{step.number}</span>
                  )}
                </button>

                {/* Step label */}
                <div className="mt-2 text-center">
                  <div
                    className={cn(
                      "text-xs font-medium transition-colors",
                      isCurrent && "text-primary",
                      isCompleted && !isCurrent && "text-foreground",
                      !isCompleted && !isCurrent && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </div>
                  {step.optional && (
                    <div className="text-xs text-muted-foreground mt-0.5">(Optional)</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
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

  // Check if website exists when on business-info step
  useEffect(() => {
    const checkWebsiteExists = async () => {
      if (currentStep === "business-info" && businessWebsiteUrl.trim() && !blogId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const formattedUrl = businessWebsiteUrl.trim().match(/^https?:\/\//)
            ? businessWebsiteUrl.trim()
            : `https://${businessWebsiteUrl.trim()}`;
          const normalizedUrl = formattedUrl.toLowerCase().replace(/\/$/, "");

          const { data: existingSites } = await supabase
            .from("blogs")
            .select("id, website_homepage")
            .eq("user_id", user.id);

          const exists = existingSites?.some((site) => {
            if (!site.website_homepage) return false;
            const existingHomepage = site.website_homepage.toLowerCase().replace(/\/$/, "");
            return existingHomepage === normalizedUrl;
          });

          if (exists) {
            const existingBlog = existingSites?.find((site) => {
              if (!site.website_homepage) return false;
              const existingHomepage = site.website_homepage.toLowerCase().replace(/\/$/, "");
              return existingHomepage === normalizedUrl;
            });
            if (existingBlog?.id) {
              setBlogId(existingBlog.id);
              setWebsiteExists(true);
            }
          } else {
            setWebsiteExists(false);
          }
        } catch (error) {
          console.error("Error checking website existence:", error);
        }
      } else if (blogId) {
        setWebsiteExists(true);
      } else {
        setWebsiteExists(false);
      }
    };

    checkWebsiteExists();
  }, [currentStep, businessWebsiteUrl, blogId]);

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
        // If CMS is already connected, go to connection form step
        setCurrentStep("connection");
      } else {
        // Site doesn't have a CMS connected - show CMS connection step with stepper
        setCurrentStep("cms-connection");
      }
    } catch (error) {
      console.error("Error loading blog data:", error);
      toast.error("Failed to load site information");
      // Fallback to CMS connection step if loading fails
      setCurrentStep("cms-connection");
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
    setAnalysisStep("Fetching website content...");
    
    // Simulate progress steps for better UX
    const progressSteps = [
      "Fetching website content...",
      "Extracting business information...",
      "Analyzing website content...",
      "Finding additional pages...",
      "Analyzing business context with AI...",
      "Discovering competitors...",
    ];
    
    let currentStepIndex = 0;
    let stepInterval: ReturnType<typeof setInterval> | null = null;
    
    try {
      stepInterval = setInterval(() => {
        if (currentStepIndex < progressSteps.length - 1) {
          currentStepIndex++;
          setAnalysisStep(progressSteps[currentStepIndex]);
        }
      }, 2000); // Update every 2 seconds
      
      const { data, error } = await supabase.functions.invoke("analyze-website", {
        body: { url: formattedUrl },
      });
      
      if (stepInterval) clearInterval(stepInterval);
      setAnalysisStep("Finalizing analysis...");

      if (error) throw error;

      if (data?.success && data?.businessInfo) {
        // Auto-populate business info with extracted data
        setBusinessInfo({
          company_name: data.businessInfo.company_name || "",
          company_description: data.businessInfo.company_description || "",
          industry: data.businessInfo.industry || "",
          target_audience: data.businessInfo.target_audience || "",
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
      if (stepInterval) clearInterval(stepInterval);
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
      setAnalysisStep("");
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

    setIsSavingBusinessInfo(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Format business website URL
      const formattedUrl = businessWebsiteUrl.trim().match(/^https?:\/\//)
        ? businessWebsiteUrl.trim()
        : `https://${businessWebsiteUrl.trim()}`;

      // Normalize URL for comparison
      const normalizedUrl = formattedUrl.toLowerCase().replace(/\/$/, "");

      // ALWAYS check database first to see if blog already exists for this URL
      const { data: existingSites } = await supabase
        .from("blogs")
        .select("id, website_homepage, title")
        .eq("user_id", user.id);

      // Find existing blog for this URL
      const existingBlog = existingSites?.find((site) => {
        if (!site.website_homepage) return false;
        const existingHomepage = site.website_homepage.toLowerCase().replace(/\/$/, "");
        return existingHomepage === normalizedUrl;
      });

      // Use existing blog ID if found, otherwise use state blogId
      const blogIdToUse = existingBlog?.id || blogId;
      const isUpdating = !!blogIdToUse;

      // Extract site name from URL for title
      const siteName = new URL(formattedUrl).hostname.split(".")[0];

      // Prepare blog data
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

      if (blogIdToUse) {
        // Blog already exists - UPDATE it
        const { error } = await supabase
          .from("blogs")
          .update(blogData)
          .eq("id", blogIdToUse);

        if (error) throw error;

        // Ensure blogId is set in state
        setBlogId(blogIdToUse);

        // Refresh the site switcher to show updated site
        await refreshSites();

        toast.success("Business information updated!");
        setCurrentStep("competitors");
      } else {
        // Blog doesn't exist - check site limit before creating
        const canCreate = await canCreateSite(user.id);
        if (!canCreate) {
          toast.error("You've reached your site limit. Please upgrade your plan to add more sites.");
          navigate("/plans");
          return;
        }

        // CREATE new blog
        const { data: resultData, error } = await supabase
          .from("blogs")
          .insert({
            user_id: user.id,
            ...blogData,
          })
          .select()
          .single();

        if (error) throw error;

        // Set blogId in state
        setBlogId(resultData.id);

        // Refresh the site switcher to show the new site
        await refreshSites();

        toast.success("Site created! Now let's add competitors.");
        setCurrentStep("competitors");
      }
    } catch (error: any) {
      console.error("Error creating/updating site:", error);
      toast.error("Failed to save business information: " + error.message);
    } finally {
      setIsSavingBusinessInfo(false);
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

        // Refresh the site switcher to show updated site
        await refreshSites();

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

        // Refresh the site switcher to show the new site
        await refreshSites();

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
    
    // Refresh the site switcher before completing
    await refreshSites();

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

      // Refresh the site switcher to show updated site
      await refreshSites();

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
              // Go back to CMS platform selection (works for both new and reconnecting)
              setSelectedPlatform(null);
              setCurrentStep("cms-connection");
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
      <>
      <Card className="p-8 bg-card max-w-2xl">
        <OnboardingStepper />
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
            <Button variant="outline" onClick={onCancel} className="flex-1" disabled={isAnalyzing}>
              Cancel
            </Button>
            <Button 
              onClick={handleBusinessWebsiteContinue} 
              disabled={!businessWebsiteUrl.trim() || isAnalyzing}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </div>
      </Card>

      {/* Enhanced Loading Overlay */}
      {isAnalyzing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
          {/* Gradient backgrounds */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -left-1/4 top-0 h-full w-1/2 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent blur-3xl" />
            <div className="absolute -right-1/4 top-0 h-full w-1/2 bg-gradient-to-l from-primary/20 via-primary/10 to-transparent blur-3xl" />
          </div>
          
          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-center space-y-6 px-4">
            {/* Animated Spinner */}
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-4 border-primary/20"></div>
              <div className="absolute top-0 left-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-primary"></div>
              <div className="absolute top-1/2 left-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-primary/10"></div>
            </div>
            
            {/* Main Message */}
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold text-foreground">
                We are analyzing your website
              </h3>
              <p className="text-sm text-muted-foreground animate-pulse">
                {analysisStep || "Analyzing website content..."}
              </p>
            </div>
            
            {/* Progress Dots */}
            <div className="flex space-x-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full bg-primary/40 animate-pulse"
                  style={{
                    animationDelay: `${i * 0.2}s`,
                    animationDuration: '1.4s',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // Step 2: Business Information
  if (currentStep === "business-info" && !propBlogId) {
    return (
      <Card className="p-8 bg-card max-w-2xl">
        <OnboardingStepper />
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

          {/* Status indicator */}
          {(blogId || websiteExists) && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                <Check className="w-4 h-4" />
                <span>Website already created. Changes will update your existing site.</span>
              </div>
            </div>
          )}

          {/* Loading indicator when processing */}
          {isSavingBusinessInfo && (
            <div className="mb-4 p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {(blogId || websiteExists) ? "Updating website..." : "Creating website..."}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(blogId || websiteExists)
                      ? "Saving your business information..." 
                      : "Setting up your website, this will only take a moment..."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setCurrentStep("website-url")} 
              className="flex-1"
              disabled={isSavingBusinessInfo}
            >
              Back
            </Button>
            <Button 
              onClick={handleBusinessInfoContinue} 
              className="flex-1" 
              disabled={isSavingBusinessInfo || !businessInfo.company_name.trim() || !businessInfo.company_description.trim()}
            >
              {isSavingBusinessInfo ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {(blogId || websiteExists) ? "Updating..." : "Creating..."}
                </>
              ) : (
                (blogId || websiteExists) ? "Update & Continue" : "Create Website & Continue"
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
        <OnboardingStepper />
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
        <OnboardingStepper />
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
    return (
      <Card className="p-8 bg-card max-w-2xl">
        {propBlogId && <OnboardingStepper />}
        {renderConnectionForm()}
      </Card>
    );
  }

  // CMS Connection Step (Step 4) - Platform Selection with Skip option
  if (currentStep === "cms-connection" && !selectedPlatform) {
    return (
      <Card className="p-8 bg-card max-w-4xl">
        <OnboardingStepper />
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (propBlogId) {
                // When reconnecting, cancel and go back to dashboard
                onCancel();
              } else {
                // When in normal flow, go back to competitors step
                setCurrentStep("competitors");
              }
            }}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {propBlogId ? "Reconnect CMS" : "Connect Your CMS (Optional)"}
          </h2>
          <p className="text-muted-foreground">
            {propBlogId 
              ? "Choose your CMS platform to enable automatic publishing of AI-generated articles"
              : "Connect your CMS now to enable automatic publishing, or skip and connect later from Settings."}
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
          {!propBlogId && (
            <Button variant="outline" onClick={handleSkipCMS}>
              Skip & Continue
            </Button>
          )}
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  // Platform Selection Step - show for reconnecting (no CMS) or legacy flow
  if (currentStep === "platform") {
    return (
      <Card className="p-8 bg-card max-w-4xl">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {propBlogId ? "Connect Your CMS" : "Connect Your CMS"}
          </h2>
          <p className="text-muted-foreground">
            {propBlogId 
              ? "Choose your CMS platform to enable automatic publishing of AI-generated articles"
              : "Choose your platform to automatically sync and publish SEO-optimized content"}
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
