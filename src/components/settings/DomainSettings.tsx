import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { useSiteContext } from "@/contexts/SiteContext";

interface DomainSettingsProps {
  blogId: string;
}

export function DomainSettings({ blogId }: DomainSettingsProps) {
  const { refreshSites } = useSiteContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    subdomain: "",
    custom_domain: "",
    website_homepage: "",
  });

  useEffect(() => {
    const fetchSiteData = async () => {
      try {
        const { data, error } = await supabase
          .from("blogs")
          .select("subdomain, custom_domain, website_homepage")
          .eq("id", blogId)
          .single();

        if (error) throw error;

        if (data) {
          setFormData({
            subdomain: data.subdomain || "",
            custom_domain: data.custom_domain || "",
            website_homepage: data.website_homepage || "",
          });
        }
      } catch (error: any) {
        console.error("Error fetching domain data:", error);
        toast.error("Failed to load domain settings");
      } finally {
        setLoading(false);
      }
    };

    if (blogId) {
      fetchSiteData();
    }
  }, [blogId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("blogs")
        .update({
          custom_domain: formData.custom_domain || null,
          website_homepage: formData.website_homepage || null,
          // Note: subdomain is typically read-only, but we'll include it for display
        })
        .eq("id", blogId);

      if (error) throw error;

      toast.success("Domain settings saved successfully");
      // Refresh site context to update UI
      await refreshSites();
    } catch (error: any) {
      console.error("Error saving domain settings:", error);
      toast.error("Failed to save domain settings: " + error.message);
    } finally {
      setSaving(false);
    }
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Domain Settings</CardTitle>
        <CardDescription>
          Configure your site's domain and homepage URL
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="subdomain">Subdomain</Label>
          <div className="flex items-center gap-2">
            <Input
              id="subdomain"
              value={formData.subdomain}
              disabled
              className="bg-muted"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              .searchfuel.app
            </span>
            <Lock className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">
            Subdomain cannot be changed after creation
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom_domain">Custom Domain</Label>
          <Input
            id="custom_domain"
            value={formData.custom_domain}
            onChange={(e) => setFormData({ ...formData, custom_domain: e.target.value })}
            placeholder="example.com"
          />
          <p className="text-xs text-muted-foreground">
            Your custom domain (without http:// or https://)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="website_homepage">Website Homepage</Label>
          <Input
            id="website_homepage"
            value={formData.website_homepage}
            onChange={(e) => setFormData({ ...formData, website_homepage: e.target.value })}
            placeholder="https://example.com"
          />
          <p className="text-xs text-muted-foreground">
            The main URL of your website
          </p>
        </div>

        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#8B7355] hover:bg-[#8B7355]/90 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

