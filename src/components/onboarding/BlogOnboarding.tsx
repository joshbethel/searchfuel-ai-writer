import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ArticleTypeSettings } from "@/components/settings/ArticleTypeSettings";

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
}

interface BlogOnboardingProps {
  open: boolean;
  onComplete: () => void;
  onCancel: () => void;
}

const CMS_PLATFORMS = [
  { id: "wordpress" as const, name: "WordPress", icon: "🔷", description: "Connect your WordPress site" },
  // { id: "webflow" as const, name: "Webflow", icon: "⚡", description: "Sync with Webflow CMS" },
  // { id: "ghost" as const, name: "Ghost", icon: "👻", description: "Integrate Ghost publishing" },
  { id: "shopify" as const, name: "Shopify", icon: "🛍️", description: "Connect your Shopify store" },
  // { id: "wix" as const, name: "WIX", icon: "🌐", description: "Sync with WIX website" },
  // { id: "framer" as const, name: "Framer", icon: "🎨", description: "Connect Framer site" },
  // { id: "notion" as const, name: "Notion", icon: "📝", description: "Sync with Notion database" },
  // { id: "hubspot" as const, name: "HubSpot", icon: "🎯", description: "Connect HubSpot CMS" },
  // { id: "nextjs" as const, name: "Next.js", icon: "⚫", description: "Connect Next.js blog" },
  // { id: "rest_api" as const, name: "REST API", icon: "🔌", description: "Custom REST API" },
];

export function BlogOnboarding({ open, onComplete, onCancel }: BlogOnboardingProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<CMSPlatform | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [currentStep, setCurrentStep] = useState<"platform" | "connection" | "article-types">("platform");
  const [blogId, setBlogId] = useState<string | null>(null);
  const [connectionData, setConnectionData] = useState<CMSConnection>({
    platform: "wordpress",
    siteUrl: "",
    apiKey: "",
    apiSecret: "",
  });

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

    // Add https:// if no protocol is specified
    const formattedUrl = connectionData.siteUrl.trim().match(/^https?:\/\//)
      ? connectionData.siteUrl.trim()
      : `https://${connectionData.siteUrl.trim()}`;

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if blog already exists for this user
      const { data: existingBlog } = await supabase.from("blogs").select("id").eq("user_id", user.id).maybeSingle();

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

      let resultData;

      if (existingBlog) {
        // Update existing blog with CMS connection
        const { data, error } = await supabase
          .from("blogs")
          .update(blogData)
          .eq("id", existingBlog.id)
          .select()
          .single();

        if (error) throw error;
        resultData = data;
      } else {
        // Create new blog
        const { data, error } = await supabase
          .from("blogs")
          .insert({
            user_id: user.id,
            ...blogData,
          })
          .select()
          .single();

        if (error) throw error;
        resultData = data;
      }

      toast.success("CMS connected successfully!");
      setBlogId(resultData.id);

      // Automatically generate the first article
      toast.info("Generating your first article...");
      try {
        await supabase.functions.invoke("generate-blog-post", {
          body: { blogId: resultData.id },
        });
        toast.success("First article generated! Check your dashboard.");
      } catch (genError) {
        console.error("Error generating first article:", genError);
        toast.error("CMS connected but article generation failed. You can generate articles from the Articles page.");
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
    onComplete();
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
              setSelectedPlatform(null);
              setCurrentStep("platform");
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
            <>
              <div>
                <Label htmlFor="apiKey">Collection ID *</Label>
                <Input
                  id="apiKey"
                  type="text"
                  placeholder="Enter your Framer CMS Collection ID"
                  value={connectionData.apiKey}
                  onChange={(e) => setConnectionData({ ...connectionData, apiKey: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Found in Framer → CMS → Your Collection → Settings → Collection ID
                </p>
              </div>
              <div>
                <Label htmlFor="accessToken">API Token *</Label>
                <Input
                  id="accessToken"
                  type="password"
                  placeholder="Enter your Framer API Token"
                  value={connectionData.accessToken}
                  onChange={(e) => setConnectionData({ ...connectionData, accessToken: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Generate from Workspace Settings → Integrations/API → Create Token (enable CMS permissions)
                </p>
              </div>
              <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Quick Setup:</h4>
                <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Click your workspace name (top left in Framer)</li>
                  <li>Look for Workspace Settings → Integrations or API section</li>
                  <li>Create an API Token with CMS read/write permissions</li>
                  <li>Copy the generated token</li>
                  <li>In your project: CMS → Select collection → Settings</li>
                  <li>Copy the Collection ID from collection settings</li>
                </ol>
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

  // Connection Form Step
  if (currentStep === "connection" && selectedPlatform) {
    return <Card className="p-8 bg-card max-w-2xl">{renderConnectionForm()}</Card>;
  }

  // Platform Selection Step
  return (
    <Card className="p-8 bg-card max-w-4xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">Connect Your CMS</h2>
        <p className="text-muted-foreground">
          Choose your platform to automatically sync and publish SEO-optimized content
        </p>
      </div>

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
