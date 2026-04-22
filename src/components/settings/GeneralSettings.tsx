import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Building2, Loader2, Sparkles, UserRound } from "lucide-react";
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
    target_audience: "",
    auto_post_enabled: true,
  });

  useEffect(() => {
    const fetchSiteData = async () => {
      try {
        const { data, error } = await supabase
          .from("blogs")
          .select("title, description, company_name, target_audience, auto_post_enabled")
          .eq("id", blogId)
          .single();

        if (error) throw error;

        if (data) {
          setFormData({
            title: data.title || "",
            description: data.description || "",
            company_name: data.company_name || "",
            target_audience: data.target_audience || "",
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
          target_audience: formData.target_audience || null,
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
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          General Settings
        </CardTitle>
        <CardDescription>
          Update your site's basic information and preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Site Title</p>
            <p className="mt-1 font-semibold truncate">{formData.title || "Not set"}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Company</p>
            <p className="mt-1 font-semibold truncate">{formData.company_name || "Not set"}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Auto Post</p>
            <p className="mt-1">
              <Badge variant={formData.auto_post_enabled ? "default" : "secondary"}>
                {formData.auto_post_enabled ? "Enabled" : "Disabled"}
              </Badge>
            </p>
          </div>
        </div>

        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/50">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Site Profile</p>
              <p className="text-xs text-muted-foreground">Core site details used throughout your workspace.</p>
            </div>
          </div>

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
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="A brief description of your site"
            />
            <p className="text-xs text-muted-foreground">
              Optional description of your site
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/50">
              <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Audience Context</p>
              <p className="text-xs text-muted-foreground">Guide content generation with company and audience context.</p>
            </div>
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

          <div className="space-y-2">
            <Label htmlFor="target_audience">Target Audience</Label>
            <Textarea
              id="target_audience"
              value={formData.target_audience}
              onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
              placeholder="Describe your target audience (e.g., demographics, interests, needs)"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Optional description of your target audience
            </p>
          </div>
        </section>

        <section className="flex items-center justify-between space-x-2 rounded-xl border bg-card p-4">
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
        </section>

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={saving || !formData.title.trim()}
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

