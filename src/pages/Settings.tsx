import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { BacklinkSettings } from "@/components/settings/BacklinkSettings";
import { ArticleTypeSettings } from "@/components/settings/ArticleTypeSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [blogId, setBlogId] = useState<string | null>(null);
  
  const tabParam = searchParams.get('tab');
  const defaultTab = (tabParam === 'backlinks' || tabParam === 'article-types' || tabParam === 'subscription') ? tabParam : 'account';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      
      // Load user's blog
      if (session?.user) {
        supabase
          .from("blogs")
          .select("id")
          .eq("user_id", session.user.id)
          .single()
          .then(({ data }) => {
            if (data) setBlogId(data.id);
          });
      }
    });
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Failed to logout");
    } else {
      toast.success("Logged out successfully");
      navigate("/");
    }
  };

  const handleDeleteAccount = () => {
    // Implement delete account logic
    console.log("Delete account clicked");
    toast.info("Delete account functionality coming soon");
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
        </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="article-types">Article Types</TabsTrigger>
          <TabsTrigger value="backlinks">Backlinks</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
        </TabsList>

          <TabsContent value="account" className="space-y-6 mt-6">
            {/* Organization Section */}
            <Card>
              <CardHeader>
                <CardTitle>Your Organization</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-8">
                <p className="text-muted-foreground mb-4">No organization found</p>
                <Button variant="default" className="bg-[#8B7355] hover:bg-[#8B7355]/90 text-white">
                  Set Up Organization
                </Button>
              </CardContent>
            </Card>

            {/* Account Settings Section */}
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={user?.email || ""}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Logout</span>
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={handleLogout}
                    >
                      Logout
                    </Button>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-destructive">Delete Account</span>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={handleDeleteAccount}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="article-types" className="mt-6">
            {blogId ? (
              <ArticleTypeSettings blogId={blogId} />
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-12">
                  <p className="text-muted-foreground">Complete blog setup to configure article types</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="backlinks" className="mt-6">
            {blogId ? (
              <BacklinkSettings blogId={blogId} />
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-12">
                  <p className="text-muted-foreground">Complete blog setup to configure backlinks</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="subscription" className="space-y-6 mt-6">
            {/* Subscription Section */}
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Current Plan</p>
              <p className="text-lg font-semibold">Free</p>
            </div>
            
            <Button className="w-full bg-[#8B7355] hover:bg-[#8B7355]/90 text-white">
              ↗ Upgrade to Pro
            </Button>

            <div className="pt-4">
              <p className="text-sm font-medium mb-3">Upgrade to get:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">20-40 AI-generated posts per month</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">SEO keyword targeting (100+ keywords)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Access to backlink network</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Competitor analysis & tracking</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Analytics dashboard</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Fully white-labeled blog</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
