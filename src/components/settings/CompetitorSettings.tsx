import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Swords, Trash2, ExternalLink } from "lucide-react";

interface Competitor {
  domain: string;
  name?: string;
  url?: string;
  added_at?: string;
}

interface CompetitorSettingsProps {
  blogId: string;
}

export function CompetitorSettings({ blogId }: CompetitorSettingsProps) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const MAX_COMPETITORS = 7;

  useEffect(() => {
    loadSettings();
  }, [blogId]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("blogs")
        .select("competitors")
        .eq("id", blogId)
        .single();

      if (error) throw error;

      setCompetitors((data.competitors as unknown as Competitor[]) || []);
    } catch (error) {
      console.error("Error loading competitor settings:", error);
      toast.error("Failed to load competitor settings");
    } finally {
      setLoading(false);
    }
  };

  const validateDomain = (domain: string): boolean => {
    // Remove protocol if present
    const cleaned = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(cleaned);
  };

  const handleAddCompetitor = () => {
    if (!newDomain.trim()) {
      toast.error("Please enter a competitor domain");
      return;
    }

    if (competitors.length >= MAX_COMPETITORS) {
      toast.error(`Maximum ${MAX_COMPETITORS} competitors allowed`);
      return;
    }

    // Clean domain
    let cleanedDomain = newDomain.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    if (!validateDomain(cleanedDomain)) {
      toast.error("Please enter a valid domain (e.g., competitor.com)");
      return;
    }

    // Check for duplicates
    if (competitors.some(c => c.domain.toLowerCase() === cleanedDomain.toLowerCase())) {
      toast.error("This competitor is already added");
      return;
    }

    const newCompetitor: Competitor = {
      domain: cleanedDomain,
      name: cleanedDomain,
      added_at: new Date().toISOString()
    };

    setCompetitors([...competitors, newCompetitor]);
    setNewDomain("");
  };

  const handleRemoveCompetitor = (index: number) => {
    setCompetitors(competitors.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from("blogs")
        .update({
          competitors: competitors as any,
        })
        .eq("id", blogId);

      if (error) throw error;

      toast.success("Competitor settings saved successfully");
    } catch (error) {
      console.error("Error saving competitor settings:", error);
      toast.error("Failed to save competitor settings");
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
          <Swords className="h-4 w-4 text-indigo-500" />
          Competitors
        </CardTitle>
        <CardDescription>
          Add your competitors to help us generate more effective keywords.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Saved Competitors</p>
            <p className="mt-1 text-lg font-semibold">{competitors.length}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Remaining Slots</p>
            <p className="mt-1 text-lg font-semibold">{Math.max(MAX_COMPETITORS - competitors.length, 0)}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Limit</p>
            <p className="mt-1 text-lg font-semibold">{MAX_COMPETITORS}</p>
          </div>
        </div>

        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <Label>Competitors ({competitors.length}/{MAX_COMPETITORS})</Label>
            {competitors.length < MAX_COMPETITORS && (
              <span className="text-sm text-muted-foreground">
                Add competitors to improve keyword analysis
              </span>
            )}
          </div>
          
          {competitors.length > 0 && (
            <div className="space-y-3">
              {competitors.map((competitor, index) => (
                <div
                  key={index}
                  className="flex items-start justify-between p-4 border rounded-xl bg-muted/20"
                >
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    <a
                      href={competitor.url || `https://${competitor.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-mono text-primary hover:underline cursor-pointer"
                    >
                      {competitor.domain}
                    </a>
                    {competitor.name && competitor.name !== competitor.domain && (
                      <span className="text-sm text-muted-foreground">({competitor.name})</span>
                    )}
                    <Badge variant="secondary" className="text-[10px]">Tracked</Badge>
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
          {competitors.length < MAX_COMPETITORS && (
            <div className="space-y-3 p-4 border rounded-xl border-dashed">
              <h4 className="text-sm font-medium">Add Competitor</h4>
              
              <div className="space-y-2">
                <Label htmlFor="new-competitor">Competitor Domain</Label>
                <Input
                  id="new-competitor"
                  placeholder="competitor.com or www.competitor.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
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

          {competitors.length >= MAX_COMPETITORS && (
            <div className="p-4 bg-muted rounded-xl">
              <p className="text-sm text-muted-foreground">
                Maximum {MAX_COMPETITORS} competitors reached. Remove one to add another.
              </p>
            </div>
          )}
        </section>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} className="min-w-[220px]">
            Save Competitor Settings
          </Button>
        </div>

        <div className="p-4 bg-muted rounded-xl space-y-2">
          <h4 className="text-sm font-medium">How It Works</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Define up to {MAX_COMPETITORS} competitor websites</li>
            <li>• System analyzes their content to find relevant keywords</li>
            <li>• Competitor analysis improves keyword recommendations</li>
            <li>• Each website/blog has its own competitor list</li>
            <li>• System also uses SERP data to find additional competitors</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

