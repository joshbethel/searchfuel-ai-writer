import { useEffect, useMemo, useState } from "react";
import { useSiteContext } from "@/contexts/SiteContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bot, CircleCheck, CircleX, Cpu, DollarSign, Loader2, RefreshCw, Settings, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PROVIDER_META: Record<string, { label: string; logoSrc: string }> = {
  chat_gpt: { label: "ChatGPT", logoSrc: "/images/openai.svg" },
  perplexity: { label: "Perplexity", logoSrc: "/images/perplexity-color.svg" },
  gemini: { label: "Gemini", logoSrc: "/images/gemini-color.svg" },
  claude: { label: "Claude", logoSrc: "/images/claude.svg" },
  grok: { label: "Grok", logoSrc: "/images/grok.svg" },
  copilot: { label: "Copilot", logoSrc: "/images/copilot-color.svg" },
  ai_overviews: { label: "AI Overviews", logoSrc: "/images/ai-overviews.svg" },
  ai_mode: { label: "AI Mode", logoSrc: "/images/ai-mode.svg" },
};

const formatProvider = (provider: string | null | undefined) => {
  if (!provider) return "Unknown";
  const key = String(provider).toLowerCase();
  return PROVIDER_META[key]?.label || provider.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatPercent = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${(parsed * 100).toFixed(1)}%`;
};

const DEFAULT_ENABLED_MODELS = {
  chat_gpt: true,
  gemini: true,
  perplexity: true,
} as const;

type RunProvider = keyof typeof DEFAULT_ENABLED_MODELS;
const RUN_PROVIDER_KEYS: RunProvider[] = ["chat_gpt", "gemini", "perplexity"];

const normalizeEnabledModels = (input: unknown): Record<RunProvider, boolean> => {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    chat_gpt: raw.chat_gpt !== false,
    gemini: raw.gemini !== false,
    perplexity: raw.perplexity !== false,
  };
};

export default function AiVisibility() {
  const { selectedSite } = useSiteContext();
  const blogId = selectedSite?.id;
  const navigate = useNavigate();

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [latestRun, setLatestRun] = useState<any | null>(null);
  const [mentions, setMentions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [activePrompts, setActivePrompts] = useState<string[]>([]);
  const [siteEnabledModels, setSiteEnabledModels] = useState<Record<RunProvider, boolean>>(DEFAULT_ENABLED_MODELS);
  const [adminEnabledModels, setAdminEnabledModels] = useState<Record<RunProvider, boolean>>(DEFAULT_ENABLED_MODELS);
  const [siteMaxCostUsd, setSiteMaxCostUsd] = useState<number | null>(null);
  const [adminMaxCostUsd, setAdminMaxCostUsd] = useState<number | null>(null);

  const hasSite = useMemo(() => Boolean(blogId), [blogId]);
  const activePromptCount = useMemo(() => activePrompts.length, [activePrompts]);
  const hasActivePrompts = useMemo(() => activePromptCount > 0, [activePromptCount]);
  const mentionCount = useMemo(() => mentions.length, [mentions]);
  const detectedMentions = useMemo(() => mentions.filter((m) => Boolean(m.detected_brand)).length, [mentions]);
  const avgVisibility = useMemo(() => {
    if (metrics.length === 0) return null;
    const valid = metrics
      .map((row) => Number(row.visibility_score))
      .filter((score) => Number.isFinite(score));
    if (valid.length === 0) return null;
    return valid.reduce((acc, value) => acc + value, 0) / valid.length;
  }, [metrics]);
  const avgSov = useMemo(() => {
    if (metrics.length === 0) return null;
    const valid = metrics
      .map((row) => Number(row.share_of_voice))
      .filter((score) => Number.isFinite(score));
    if (valid.length === 0) return null;
    return valid.reduce((acc, value) => acc + value, 0) / valid.length;
  }, [metrics]);
  const plannedProviders = useMemo(
    () =>
      RUN_PROVIDER_KEYS.filter(
        (provider) => adminEnabledModels[provider] !== false && siteEnabledModels[provider] !== false,
      ),
    [adminEnabledModels, siteEnabledModels],
  );
  const effectiveMaxCostUsd = useMemo(() => {
    if (siteMaxCostUsd == null && adminMaxCostUsd == null) return null;
    if (siteMaxCostUsd == null) return adminMaxCostUsd;
    if (adminMaxCostUsd == null) return siteMaxCostUsd;
    return Math.min(siteMaxCostUsd, adminMaxCostUsd);
  }, [siteMaxCostUsd, adminMaxCostUsd]);

  const fetchData = async () => {
    if (!blogId) return;
    setLoading(true);
    try {
      const sb = supabase as any;
      const [
        { data: runData },
        { data: mentionData },
        { data: metricsData },
        { data: promptRows },
        { data: settings },
        { data: adminPolicy },
      ] = await Promise.all([
        sb.from("ai_visibility_runs").select("*").eq("blog_id", blogId).order("started_at", { ascending: false }).limit(1),
        sb
          .from("ai_visibility_mentions")
          .select("*")
          .eq("blog_id", blogId)
          .order("created_at", { ascending: false })
          .limit(30),
        sb
          .from("ai_visibility_model_metrics")
          .select("*")
          .eq("blog_id", blogId)
          .order("created_at", { ascending: false })
          .limit(30),
        sb
          .from("ai_visibility_prompts")
          .select("prompt_text, sort_order")
          .eq("blog_id", blogId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        sb
          .from("ai_visibility_settings")
          .select("enabled_models, max_cost_usd")
          .eq("blog_id", blogId)
          .maybeSingle(),
        sb
          .from("ai_visibility_admin_policy")
          .select("enabled_models, max_cost_usd")
          .eq("id", true)
          .maybeSingle(),
      ]);

      const run = runData?.[0] || null;
      setLatestRun(run);
      setMentions(mentionData || []);
      const promptList = Array.isArray(promptRows)
        ? promptRows
            .map((row: { prompt_text?: string }) => String(row.prompt_text || "").trim())
            .filter(Boolean)
        : [];
      setActivePrompts(promptList);
      setSiteEnabledModels(normalizeEnabledModels(settings?.enabled_models));
      setAdminEnabledModels(normalizeEnabledModels(adminPolicy?.enabled_models));
      setSiteMaxCostUsd(Number.isFinite(Number(settings?.max_cost_usd)) ? Number(settings.max_cost_usd) : null);
      setAdminMaxCostUsd(Number.isFinite(Number(adminPolicy?.max_cost_usd)) ? Number(adminPolicy.max_cost_usd) : null);

      // Keep only latest metric row per provider for display.
      const latestByProvider = new Map<string, any>();
      for (const row of metricsData || []) {
        if (!latestByProvider.has(row.provider)) latestByProvider.set(row.provider, row);
      }
      setMetrics(Array.from(latestByProvider.values()));
    } catch (error) {
      console.error("Error loading AI visibility data:", error);
      toast.error("Failed to load AI visibility data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blogId]);

  const openManualSyncDialog = () => {
    if (!blogId) return;
    if (!hasActivePrompts) {
      toast.error("No active prompts found. Add prompts in Site Settings → AI Visibility first.");
      return;
    }
    if (plannedProviders.length === 0) {
      toast.error("No models are currently enabled. Update AI Visibility model settings first.");
      return;
    }
    setSyncDialogOpen(true);
  };

  const handleManualSync = async () => {
    if (!blogId) return;
    setSyncDialogOpen(false);
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-visibility-sync", {
        body: { blog_id: blogId },
      });

      if (error) throw error;
      if (data?.status === "paused") {
        toast.info("AI visibility sync is paused for this site.");
      } else {
        toast.success("AI visibility sync finished.");
      }
      await fetchData();
    } catch (error: any) {
      console.error("Error running AI visibility sync:", error);
      if (String(error?.message || "").includes("No active prompts found")) {
        toast.error("No active prompts found. Add prompts in Site Settings → AI Visibility first.");
        return;
      }
      toast.error(`Sync failed: ${error?.message ?? "Unknown error"}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!hasSite) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>AI Visibility</CardTitle>
            <CardDescription>Select a site first to view AI visibility data.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            AI Visibility
          </h1>
          <p className="text-muted-foreground">
            Track your mentions and AI model performance, with manual sync support.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/site-settings?tab=ai-visibility")}>
            <Settings className="h-4 w-4 mr-2" />
            AI Visibility Settings
          </Button>
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
          <Button onClick={openManualSyncDialog} disabled={isSyncing || !hasActivePrompts}>
            {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Run Manual Sync
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active Prompts</p>
            <p className="mt-1 text-2xl font-semibold">{activePromptCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Mentions Detected</p>
            <p className="mt-1 text-2xl font-semibold">{detectedMentions}</p>
            <p className="text-xs text-muted-foreground mt-1">of {mentionCount} tracked results</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Visibility</p>
            <p className="mt-1 text-2xl font-semibold">{avgVisibility != null ? formatPercent(avgVisibility) : "-"}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Share of Voice</p>
            <p className="mt-1 text-2xl font-semibold">{avgSov != null ? formatPercent(avgSov) : "-"}</p>
          </CardContent>
        </Card>
      </div>

      {!hasActivePrompts && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-base">Add prompts before running sync</CardTitle>
            <CardDescription>
              You currently have no active prompts, so manual sync is disabled. Add at least one tracked prompt to start collecting AI visibility data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/site-settings?tab=ai-visibility")} className="gap-2">
              <Settings className="h-4 w-4" />
              Go to AI Visibility Settings
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Last Run</CardTitle>
          <CardDescription>Most recent manual sync status and cost.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Status</p>
            <div className="mt-1">
              {latestRun?.status ? (
                <Badge variant={latestRun.status === "completed" ? "default" : "secondary"}>{latestRun.status}</Badge>
              ) : (
                <span className="font-medium">No runs yet</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground">Started</p>
            <p className="font-medium">{latestRun?.started_at ? new Date(latestRun.started_at).toLocaleString() : "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Finished</p>
            <p className="font-medium">{latestRun?.finished_at ? new Date(latestRun.finished_at).toLocaleString() : "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total Cost (USD)</p>
            <p className="font-medium flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              {latestRun?.total_cost_usd ?? "-"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-indigo-500" />
            Your Mentions
          </CardTitle>
          <CardDescription>Prompt-level mention results from the latest sync runs.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[360px] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mentions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No mention data yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  mentions.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[420px] truncate">{row.prompt_text}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {PROVIDER_META[String(row.provider || "").toLowerCase()]?.logoSrc ? (
                            <img
                              src={PROVIDER_META[String(row.provider || "").toLowerCase()].logoSrc}
                              alt={formatProvider(row.provider)}
                              className="h-4 w-4 object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <Bot className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span>{formatProvider(row.provider)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.detected_brand ? (
                          <Badge className="gap-1">
                            <CircleCheck className="h-3.5 w-3.5" />
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <CircleX className="h-3.5 w-3.5" />
                            No
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{row.position ?? "-"}</TableCell>
                      <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-indigo-500" />
            AI Model Performance
          </CardTitle>
          <CardDescription>
            Visibility score = prompts with brand mention / total prompts. SOV = our mentions / total mentions across tracked brands.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Prompts</TableHead>
                <TableHead>Prompts with Mention</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>SOV</TableHead>
                <TableHead>Avg Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No model metrics yet.
                  </TableCell>
                </TableRow>
              ) : (
                metrics.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {PROVIDER_META[String(row.provider || "").toLowerCase()]?.logoSrc ? (
                          <img
                            src={PROVIDER_META[String(row.provider || "").toLowerCase()].logoSrc}
                            alt={formatProvider(row.provider)}
                            className="h-4 w-4 object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Bot className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span>{formatProvider(row.provider)}</span>
                      </div>
                    </TableCell>
                    <TableCell>{row.prompts_total}</TableCell>
                    <TableCell>{row.prompts_with_brand_mention}</TableCell>
                    <TableCell>{formatPercent(row.visibility_score)}</TableCell>
                    <TableCell>{formatPercent(row.share_of_voice)}</TableCell>
                    <TableCell>{row.avg_position ?? "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Run Manual Sync</DialogTitle>
            <DialogDescription>
              Review what this run will track before continuing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-sm font-medium">Models to Track ({plannedProviders.length})</p>
              {plannedProviders.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No models are enabled for this site.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {plannedProviders.map((provider) => (
                    <Badge key={provider} variant="secondary" className="flex items-center gap-2 py-1.5">
                      {PROVIDER_META[provider]?.logoSrc ? (
                        <img
                          src={PROVIDER_META[provider].logoSrc}
                          alt={formatProvider(provider)}
                          className="h-3.5 w-3.5 object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <Bot className="h-3.5 w-3.5" />
                      )}
                      {formatProvider(provider)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-sm font-medium">Prompts to Track ({activePromptCount})</p>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-background p-2">
                {activePrompts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active prompts found.</p>
                ) : (
                  <ol className="space-y-1 text-sm">
                    {activePrompts.map((prompt, index) => (
                      <li key={`${prompt}-${index}`} className="flex gap-2">
                        <span className="w-5 shrink-0 text-muted-foreground">{index + 1}.</span>
                        <span className="text-foreground">{prompt}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            <div className="rounded-md border border-amber-300/70 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              Estimated max run cost: {effectiveMaxCostUsd != null ? `$${effectiveMaxCostUsd.toFixed(2)}` : "Based on your settings"}.
              Actual usage may be lower and sync can stop early if budget cap is reached.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncDialogOpen(false)} disabled={isSyncing}>
              Cancel
            </Button>
            <Button onClick={handleManualSync} disabled={isSyncing || plannedProviders.length === 0}>
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Start Manual Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

