import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Wifi, WifiOff, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useSiteContext } from "@/contexts/SiteContext";

interface CMSConnectionSettingsProps {
  blogId: string;
}

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
  return names[platform || ""] || platform || "Not Connected";
};

export function CMSConnectionSettings({ blogId }: CMSConnectionSettingsProps) {
  const navigate = useNavigate();
  const { refreshSites } = useSiteContext();
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [siteData, setSiteData] = useState<{
    cms_platform: string | null;
    cms_site_url: string | null;
    cms_credentials: any;
    last_sync_at: string | null;
  } | null>(null);

  useEffect(() => {
    const fetchSiteData = async () => {
      try {
        const { data, error } = await supabase
          .from("blogs")
          .select("cms_platform, cms_site_url, cms_credentials, last_sync_at")
          .eq("id", blogId)
          .single();

        if (error) throw error;
        setSiteData(data);
      } catch (error: any) {
        console.error("Error fetching CMS data:", error);
        toast.error("Failed to load CMS connection settings");
      } finally {
        setLoading(false);
      }
    };

    if (blogId) {
      fetchSiteData();
    }
  }, [blogId]);

  const handleTestConnection = async () => {
    if (!siteData?.cms_platform || !siteData?.cms_site_url) {
      toast.error("CMS is not configured for this site");
      return;
    }

    setTesting(true);
    try {
      const credentials = siteData.cms_credentials as {
        apiKey?: string;
        apiSecret?: string;
        accessToken?: string;
        username?: string;
        password?: string;
      } || {};

      const { data, error } = await supabase.functions.invoke("test-cms-connection", {
        body: {
          platform: siteData.cms_platform,
          siteUrl: siteData.cms_site_url,
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          accessToken: credentials.accessToken,
          username: credentials.username,
          password: credentials.password,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("✅ Connection verified!");
        // Update last sync time
        await supabase
          .from("blogs")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("id", blogId);
        
        // Refresh site context and data
        await refreshSites();
        const { data: updatedData } = await supabase
          .from("blogs")
          .select("last_sync_at")
          .eq("id", blogId)
          .single();
        
        if (updatedData) {
          setSiteData({ ...siteData, last_sync_at: updatedData.last_sync_at });
        }
      } else {
        toast.error("❌ Connection failed: " + (data.error || "Unknown error"));
      }
    } catch (error: any) {
      console.error("Connection test error:", error);
      toast.error("Connection test failed: " + error.message);
    } finally {
      setTesting(false);
    }
  };

  const handleReconnect = () => {
    navigate("/dashboard?action=reconnect-cms");
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isConnected = !!siteData?.cms_platform;
  const cmsName = getCMSName(siteData?.cms_platform || null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>CMS Connection</CardTitle>
        <CardDescription>
          Manage your content management system connection
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Status */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-400"}`} />
              <div>
                <p className="font-medium">Connection Status</p>
                <p className="text-sm text-muted-foreground">
                  {isConnected ? "Connected" : "Not Connected"}
                </p>
              </div>
            </div>
            {isConnected ? (
              <Badge className="bg-green-600 text-white border-0">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="w-3 h-3 mr-1" />
                Disconnected
              </Badge>
            )}
          </div>

          {isConnected && (
            <>
              {/* CMS Platform */}
              <div className="space-y-2">
                <Label>CMS Platform</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-sm">
                    {cmsName}
                  </Badge>
                  {siteData?.cms_site_url && (
                    <a
                      href={siteData.cms_site_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent hover:underline flex items-center gap-1"
                    >
                      {siteData.cms_site_url}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Last Sync */}
              {siteData?.last_sync_at && (
                <div className="space-y-2">
                  <Label>Last Sync</Label>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(siteData.last_sync_at), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              )}
            </>
          )}

          {!isConnected && (
            <div className="p-4 bg-muted/30 rounded-lg border border-border">
              <p className="text-sm text-muted-foreground">
                No CMS connection configured. Connect your CMS to automatically publish articles.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          {isConnected && (
            <>
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing}
                className="flex-1"
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Wifi className="w-4 h-4 mr-2" />
                    Test Connection
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleReconnect}
                className="flex-1"
              >
                <WifiOff className="w-4 h-4 mr-2" />
                Reconnect CMS
              </Button>
            </>
          )}
          {!isConnected && (
            <Button
              onClick={handleReconnect}
              className="flex-1 bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
            >
              <Wifi className="w-4 h-4 mr-2" />
              Connect CMS
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

