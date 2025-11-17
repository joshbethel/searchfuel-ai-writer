import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus, Search, Loader2, Trash2, RotateCcw, Plus, AlertCircle, RefreshCw, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { autoScheduleKeyword } from "@/lib/utils/auto-schedule";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Keyword {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  intent: "Informational" | "Commercial" | "Transactional" | "Navigational";
  trend: "up" | "down" | "stable";
  cpc: number;
}


export default function Keywords() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [manualKeywords, setManualKeywords] = useState("");

  const handleScheduleKeyword = async (keyword: string) => {
    const result = await autoScheduleKeyword(keyword);
    if (result.success && result.date) {
      toast.success(`Added "${keyword}" to calendar for ${format(result.date, 'MMM d, yyyy')}`);
    } else {
      toast.error(result.error || "Failed to add to calendar");
    }
  };

  // Fetch keywords from database
  const fetchKeywords = async () => {
    try {
      setIsFetching(true);
      const { data, error } = await supabase
        .from("keywords")
        .select("*")
        .order("search_volume", { ascending: false });

      if (error) throw error;

      // Transform database data to match Keyword interface
      const transformedKeywords: Keyword[] = (data || []).map((kw) => ({
        keyword: kw.keyword,
        searchVolume: kw.search_volume || 0,
        difficulty: kw.difficulty ?? 0,
        intent: (() => {
          const v = (kw.intent as string) || 'informational';
          switch (v.toLowerCase()) {
            case 'commercial': return 'Commercial';
            case 'transactional': return 'Transactional';
            case 'navigational': return 'Navigational';
            default: return 'Informational';
          }
        })() as Keyword["intent"],
        trend: (kw.trend as Keyword["trend"]) || "stable",
        cpc: parseFloat(kw.cpc?.toString() || "0"),
      }));

      setKeywords(transformedKeywords);
    } catch (error) {
      console.error("Error fetching keywords:", error);
      toast.error("Failed to fetch keywords from database");
    } finally {
      setIsFetching(false);
    }
  };

  // Scan website for keywords
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!websiteUrl.trim()) {
      toast.error("Please enter a website URL");
      return;
    }

    // Check subscription before scanning
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to scan websites");
        return;
      }

      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status, plan_name')
        .eq('user_id', user.id)
        .maybeSingle();

      const hasActiveSubscription = subscription && 
        (subscription.status === 'active' || subscription.status === 'trialing') &&
        subscription.plan_name !== null &&
        subscription.plan_name !== 'free';

      if (!hasActiveSubscription) {
        toast.error("Please upgrade to Pro to scan websites");
        navigate("/plans");
        return;
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      toast.error("Failed to verify subscription. Please try again.");
      return;
    }

    setIsScanning(true);
    try {
      // Format URL: add https:// if no protocol is specified, remove www
      let url = websiteUrl.trim().toLowerCase();
      url = url.replace(/^(https?:\/\/)?(www\.)?/, '');
      url = `https://${url}`;

      const { data, error } = await supabase.functions.invoke("scan-website", {
        body: { url },
      });

      if (error) throw error;

      toast.success("Keywords discovered and saved!");
      setWebsiteUrl("");
      
      // Immediate refresh to show keywords
      fetchKeywords();
    } catch (error) {
      console.error("Error scanning website:", error);
      toast.error("Failed to scan website");
    } finally {
      setIsScanning(false);
    }
  };

  // Delete a keyword
  const deleteKeyword = async (keyword: string) => {
    try {
      const { error } = await supabase
        .from("keywords")
        .delete()
        .eq("keyword", keyword);

      if (error) throw error;

      toast.success("Keyword removed successfully");
      await fetchKeywords();
    } catch (error) {
      console.error("Error deleting keyword:", error);
      toast.error("Failed to delete keyword");
    }
  };

  // Start over - delete all keywords
  const handleStartOver = async () => {
    if (!confirm("This will delete all keywords and start fresh. Continue?")) {
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("keywords")
        .delete()
        .eq("user_id", user.id);
        
      if (error) throw error;
      
      toast.success("All keywords cleared");
      fetchKeywords();
    } catch (error) {
      console.error("Error clearing keywords:", error);
      toast.error("Failed to clear keywords");
    }
  };

  // Refresh stats for existing keywords via SEO API
  const handleRefreshStats = async () => {
    if (keywords.length === 0) {
      toast.info("No keywords to refresh");
      return;
    }

    try {
      setIsRefreshing(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const list = keywords.map(k => k.keyword);
      const { data, error } = await supabase.functions.invoke('fetch-seo-data', { body: { keywords: list } });
      if (error) throw error;

      // Helper to compute trend label from trendsData
      const computeTrend = (arr?: Array<{ month: string | number; volume: number }>): Keyword['trend'] => {
        if (!arr || arr.length < 6) return 'stable';
        const recent = arr.slice(0, 3);
        const older = arr.slice(-3);
        const avg = (xs: typeof recent) => xs.reduce((s, x) => s + (x.volume || 0), 0) / xs.length;
        const change = ((avg(recent) - avg(older)) / Math.max(1, avg(older))) * 100;
        if (change > 10) return 'up';
        if (change < -10) return 'down';
        return 'stable';
      };

      // Apply updates in parallel
      const updates = Object.entries(data || {}).map(async ([kw, stats]: any) => {
        const trend = computeTrend(stats?.trendsData);
        const payload: any = {
          search_volume: Number(stats?.searchVolume) || 0,
          cpc: Number(stats?.cpc) || 0,
          difficulty: Number(stats?.keywordDifficulty) || 0,
          intent: (stats?.intent || 'informational').toLowerCase(),
          trend,
          updated_at: new Date().toISOString(),
        };
        await supabase
          .from('keywords')
          .update(payload)
          .eq('user_id', user.id)
          .eq('keyword', kw);
      });

      await Promise.all(updates);
      toast.success('Keyword metrics refreshed');
      fetchKeywords();
    } catch (err: any) {
      console.error('Failed to refresh stats:', err);
      toast.error(err?.message || 'Failed to refresh stats');
    } finally {
      setIsRefreshing(false);
    }
  };
  // Add manual keywords
  const handleAddManualKeywords = async () => {
    const keywordsToAdd = manualKeywords
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);
      
    if (keywordsToAdd.length === 0) {
      toast.error("Please enter at least one keyword");
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check subscription before adding keywords
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status, plan_name')
        .eq('user_id', user.id)
        .maybeSingle();

      const hasActiveSubscription = subscription && 
        (subscription.status === 'active' || subscription.status === 'trialing') &&
        subscription.plan_name !== null &&
        subscription.plan_name !== 'free';

      if (!hasActiveSubscription) {
        toast.error("Please upgrade to Pro to add keywords");
        navigate("/plans");
        return;
      }
      
      const keywordsData = keywordsToAdd.map(keyword => ({
        user_id: user.id,
        keyword,
        search_volume: 0,
        cpc: 0,
        difficulty: null,
        competition: null,
        intent: 'informational',
        trend: 'stable',
        location_code: 2840,
        language_code: 'en'
      }));
      
      const { error } = await supabase
        .from('keywords')
        .insert(keywordsData);
        
      if (error) throw error;
      
      toast.success(`Added ${keywordsToAdd.length} keyword${keywordsToAdd.length > 1 ? 's' : ''}`);
      setShowAddDialog(false);
      setManualKeywords('');
      fetchKeywords();
    } catch (error) {
      console.error("Error adding keywords:", error);
      toast.error("Failed to add keywords");
    }
  };

  // Load keywords on mount
  useEffect(() => {
    fetchKeywords();

    // Set up realtime subscription
    const channel = supabase
      .channel("keywords-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "keywords",
        },
        () => {
          console.log("Keywords changed, refreshing...");
          fetchKeywords();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredKeywords = keywords.filter((kw) =>
    kw.keyword.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getDifficultyColor = (difficulty: number) => {
    if (difficulty < 40) return "bg-green-500/10 text-green-600 border-green-500/20";
    if (difficulty < 60) return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    return "bg-red-500/10 text-red-600 border-red-500/20";
  };

  const getIntentColor = (intent: string) => {
    switch (intent) {
      case "Informational": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "Commercial": return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      case "Transactional": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "Navigational": return "bg-orange-500/10 text-orange-600 border-orange-500/20";
      default: return "bg-gray-500/10 text-gray-600 border-gray-500/20";
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up": return <TrendingUp className="w-4 h-4 text-green-600" />;
      case "down": return <TrendingDown className="w-4 h-4 text-red-600" />;
      default: return <Minus className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Keywords</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Keywords discovered from your website analysis
          </p>
        </div>
        {keywords.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRefreshStats}
              disabled={isRefreshing}
              className="flex items-center gap-2"
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Refresh Stats
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Keywords
            </Button>
            <Button
              variant="outline"
              onClick={handleStartOver}
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Start Over
            </Button>
          </div>
        )}
      </div>

      {isFetching ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : keywords.length === 0 ? (
        <Card className="p-12 bg-card">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">
                Analyze Your Site to Discover Keywords
              </h3>
              <p className="text-muted-foreground">
                Enter your website URL to scan for SEO opportunities and keyword insights.
              </p>
            </div>
            <form onSubmit={handleScan} className="max-w-xl mx-auto">
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="text"
                  placeholder="example.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="flex-1 h-12 text-base"
                  required
                />
                <Button
                  type="submit"
                  disabled={isScanning || !websiteUrl.trim()}
                  className="h-12 px-6 shrink-0"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Analyze Website
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      ) : (
        <>
          {/* DataForSEO Status Banner */}
          {keywords.some(k => k.searchVolume === 0 && k.difficulty === 0) && (
            <Alert className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Limited Keyword Data</AlertTitle>
              <AlertDescription>
                Search volume, CPC, and competition metrics are unavailable because the DataForSEO API requires payment. Keywords have been saved with default values.
              </AlertDescription>
            </Alert>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 bg-card">
          <p className="text-sm text-muted-foreground mb-1">Total Keywords</p>
          <p className="text-2xl font-bold text-foreground">
            {isFetching ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              keywords.length
            )}
          </p>
        </Card>
        <Card className="p-4 bg-card">
          <p className="text-sm text-muted-foreground mb-1">Avg. Search Volume</p>
          <p className="text-2xl font-bold text-foreground">
            {isFetching ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : keywords.length > 0 ? (
              Math.round(
                keywords.reduce((acc, kw) => acc + kw.searchVolume, 0) / keywords.length
              ).toLocaleString()
            ) : (
              "0"
            )}
          </p>
        </Card>
        <Card className="p-4 bg-card">
          <p className="text-sm text-muted-foreground mb-1">Avg. Difficulty</p>
          <p className="text-2xl font-bold text-foreground">
            {isFetching ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : keywords.length > 0 ? (
              Math.round(
                keywords.reduce((acc, kw) => acc + kw.difficulty, 0) / keywords.length
              )
            ) : (
              "0"
            )}
          </p>
        </Card>
        <Card className="p-4 bg-card">
          <p className="text-sm text-muted-foreground mb-1">Avg. CPC</p>
          <p className="text-2xl font-bold text-foreground">
            {isFetching ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : keywords.length > 0 ? (
              `$${(keywords.reduce((acc, kw) => acc + kw.cpc, 0) / keywords.length).toFixed(2)}`
            ) : (
              "$0.00"
            )}
            </p>
          </Card>
        </div>

        {/* Search Bar */}
        <Card className="p-4 mb-6 bg-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
          </div>
          </Card>

          {/* Keywords Table */}
          <Card className="bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Keyword</TableHead>
              <TableHead>Search Volume</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Intent</TableHead>
              <TableHead>Trend</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="w-[150px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isFetching ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  <p className="text-sm text-muted-foreground mt-2">Loading keywords...</p>
                </TableCell>
              </TableRow>
            ) : filteredKeywords.length > 0 ? (
              filteredKeywords.map((keyword, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium text-foreground">{keyword.keyword}</TableCell>
                  <TableCell className="text-foreground">{keyword.searchVolume.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getDifficultyColor(keyword.difficulty)}>
                      {keyword.difficulty}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getIntentColor(keyword.intent)}>
                      {keyword.intent}
                    </Badge>
                  </TableCell>
                  <TableCell>{getTrendIcon(keyword.trend)}</TableCell>
                  <TableCell className="text-right text-foreground">${keyword.cpc.toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleScheduleKeyword(keyword.keyword)}
                        className="text-primary hover:text-primary"
                        title="Add to Calendar"
                      >
                        <Calendar className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteKeyword(keyword.keyword)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {searchQuery ? (
                    `No keywords found matching "${searchQuery}"`
                  ) : (
                    <div>
                      <p className="mb-2">No keywords yet</p>
                      <p className="text-sm">Use the research form above to add keywords</p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
            </TableBody>
          </Table>
          </Card>
        </>
      )}

      {/* Add Keywords Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Keywords Manually</DialogTitle>
            <DialogDescription>
              Enter keywords you want to track (one per line)
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="keyword 1&#10;keyword 2&#10;keyword 3"
            value={manualKeywords}
            onChange={(e) => setManualKeywords(e.target.value)}
            rows={6}
            className="resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddManualKeywords}>
              Add Keywords
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
