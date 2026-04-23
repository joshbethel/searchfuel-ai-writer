import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Globe, House, Loader2 } from "lucide-react";
import { useSiteContext } from "@/contexts/SiteContext";

interface DomainSettingsProps {
  blogId: string;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "Unknown error";
};

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
      } catch (error: unknown) {
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
    } catch (error: unknown) {
      console.error("Error saving domain settings:", error);
      toast.error("Failed to save domain settings: " + getErrorMessage(error));
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
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-indigo-500" />
          Domain Settings
        </CardTitle>
        <CardDescription>
          Configure your site's homepage URL
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/50">
              <House className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Homepage URL</p>
              <p className="text-xs text-muted-foreground">Set the main website destination used by your site profile.</p>
            </div>
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
        </section>

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="min-w-[180px]"
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

