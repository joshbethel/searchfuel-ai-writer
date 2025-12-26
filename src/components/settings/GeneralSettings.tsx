import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useSiteContext } from "@/contexts/SiteContext";

interface GeneralSettingsProps {
  blogId: string;
}

export function GeneralSettings({ blogId }: GeneralSettingsProps) {
  const { refreshSites } = useSiteContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    company_name: "",
    auto_post_enabled: true,
  });

  useEffect(() => {
    const fetchSiteData = async () => {
      try {
        const { data, error } = await supabase
          .from("blogs")
          .select("title, description, company_name, auto_post_enabled")
          .eq("id", blogId)
          .single();

        if (error) throw error;

        if (data) {
          setFormData({
            title: data.title || "",
            description: data.description || "",
            company_name: data.company_name || "",
            auto_post_enabled: data.auto_post_enabled ?? true,
          });
        }
      } catch (error: any) {
        console.error("Error fetching site data:", error);
        toast.error("Failed to load site settings");
      } finally {
        setLoading(false);
      }
    };

    if (blogId) {
      fetchSiteData();
    }
  }, [blogId]);

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("blogs")
        .update({
          title: formData.title,
          description: formData.description || null,
          company_name: formData.company_name || null,
          auto_post_enabled: formData.auto_post_enabled,
        })
        .eq("id", blogId);

      if (error) throw error;

      toast.success("Settings saved successfully");
      // Refresh site context to update UI
      await refreshSites();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings: " + error.message);
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
        <CardTitle>General Settings</CardTitle>
        <CardDescription>
          Update your site's basic information and preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Site Title *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="My Awesome Site"
          />
          <p className="text-xs text-muted-foreground">
            The display name for your site
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="A brief description of your site"
          />
          <p className="text-xs text-muted-foreground">
            Optional description of your site
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="company_name">Company Name</Label>
          <Input
            id="company_name"
            value={formData.company_name}
            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
            placeholder="Your Company Name"
          />
          <p className="text-xs text-muted-foreground">
            Optional company or organization name
          </p>
        </div>

        <div className="flex items-center justify-between space-x-2 pt-4 border-t">
          <div className="space-y-0.5">
            <Label htmlFor="auto_post">Auto-Post</Label>
            <p className="text-xs text-muted-foreground">
              Automatically publish generated articles to your CMS
            </p>
          </div>
          <Switch
            id="auto_post"
            checked={formData.auto_post_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, auto_post_enabled: checked })}
          />
        </div>

        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSave}
            disabled={saving || !formData.title.trim()}
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

