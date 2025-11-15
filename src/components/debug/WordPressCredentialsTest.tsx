import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function WordPressCredentialsTest() {
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const testConnection = async () => {
    if (!siteUrl || !username || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    const formattedUrl = siteUrl.trim().match(/^https?:\/\//) 
      ? siteUrl.trim() 
      : `https://${siteUrl.trim()}`;

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-cms-connection", {
        body: {
          platform: "wordpress",
          siteUrl: formattedUrl,
          username,
          password,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("WordPress connection successful!");
      } else {
        toast.error(data.error || "Connection failed");
      }
    } catch (error: any) {
      console.error("Connection test error:", error);
      toast.error("Failed to test connection: " + error.message);
    } finally {
      setTesting(false);
    }
  };

  const saveCredentials = async () => {
    if (!siteUrl || !username || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    const formattedUrl = siteUrl.trim().match(/^https?:\/\//) 
      ? siteUrl.trim() 
      : `https://${siteUrl.trim()}`;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if blog already exists
      const { data: existingBlog } = await supabase
        .from("blogs")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const blogData = {
        mode: "existing_site",
        title: "WordPress Test Site",
        description: "Test WordPress connection",
        company_name: "Test",
        website_homepage: formattedUrl,
        onboarding_completed: true,
        is_published: true,
        cms_platform: "wordpress",
        cms_site_url: formattedUrl,
        cms_credentials: {
          username,
          password,
        },
      };

      if (existingBlog) {
        await supabase
          .from("blogs")
          .update(blogData)
          .eq("id", existingBlog.id);
      } else {
        await supabase
          .from("blogs")
          .insert({
            user_id: user.id,
            ...blogData,
          });
      }

      toast.success("WordPress credentials saved successfully!");
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error("Failed to save credentials: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>WordPress Credentials Test</CardTitle>
        <CardDescription>
          Test the new WordPress username/password fields
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="siteUrl">Site URL</Label>
          <Input
            id="siteUrl"
            placeholder="https://yoursite.com"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            placeholder="WordPress username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">Application Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Application password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={testConnection} 
            disabled={testing}
            variant="outline"
          >
            {testing ? "Testing..." : "Test Connection"}
          </Button>
          <Button 
            onClick={saveCredentials} 
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Credentials"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}