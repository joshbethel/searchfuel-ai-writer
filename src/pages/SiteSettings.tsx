import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BacklinkSettings } from "@/components/settings/BacklinkSettings";
import { ArticleTypeSettings } from "@/components/settings/ArticleTypeSettings";
import { CompetitorSettings } from "@/components/settings/CompetitorSettings";
import { useSiteContext } from "@/contexts/SiteContext";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SiteSettings() {
  const { selectedSite } = useSiteContext();
  const blogId = selectedSite?.id || null;

  if (!blogId) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-semibold mb-6">Site Settings</h1>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please select a site from the site switcher to configure its settings.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Site Settings</h1>
        <p className="text-muted-foreground mb-6">
          Configure settings for <strong>{selectedSite?.title || selectedSite?.subdomain}</strong>
        </p>

        <Tabs defaultValue="article-types" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="article-types">Article Types</TabsTrigger>
            <TabsTrigger value="backlinks">Backlinks</TabsTrigger>
            <TabsTrigger value="competitors">Competitors</TabsTrigger>
          </TabsList>

          <TabsContent value="article-types" className="mt-6">
            <ArticleTypeSettings blogId={blogId} />
          </TabsContent>

          <TabsContent value="backlinks" className="mt-6">
            <BacklinkSettings blogId={blogId} />
          </TabsContent>

          <TabsContent value="competitors" className="mt-6">
            <CompetitorSettings blogId={blogId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

