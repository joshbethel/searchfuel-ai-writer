import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CalendarClock,
  DollarSign,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type ProviderKey = "chat_gpt" | "gemini" | "perplexity";

interface ScheduledRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  total_cost_usd: number;
  blog: { title: string | null; website_homepage: string | null } | null;
}

const MIN_RUN_COST_USD = 1;
const DEFAULT_MAX_COST_USD = 1;
const DEFAULT_ADMIN_ENABLED_MODELS: Record<ProviderKey, boolean> = {
  chat_gpt: true,
  gemini: true,
  perplexity: true,
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  completed:      { label: "Completed",      variant: "default" },
  partial:        { label: "Partial",        variant: "secondary" },
  stopped_budget: { label: "Budget cap",     variant: "secondary" },
  running:        { label: "Running",        variant: "secondary" },
  failed:         { label: "Failed",         variant: "destructive" },
  error:          { label: "Error",          variant: "destructive" },
  paused:         { label: "Paused",         variant: "outline" },
  globally_paused:{ label: "Global pause",  variant: "outline" },
};

function getNextMonday3amUtc(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilMonday,
    3, 0, 0, 0,
  ));
  return next;
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

export default function AiVisibilityAdminControls() {
  // ── Policy state ─────────────────────────────────────────────────────────
  const [aiVisibilityMaxCostUsd, setAiVisibilityMaxCostUsd] = useState<string>(String(DEFAULT_MAX_COST_USD));
  const [aiVisibilityEnabledModels, setAiVisibilityEnabledModels] = useState<Record<ProviderKey, boolean>>(DEFAULT_ADMIN_ENABLED_MODELS);
  const [weeklySyncEnabled, setWeeklySyncEnabled] = useState(true);
  const [loadingAiVisibilityPolicy, setLoadingAiVisibilityPolicy] = useState(true);
  const [savingAiVisibilityPolicy, setSavingAiVisibilityPolicy] = useState(false);

  // ── Run history state ─────────────────────────────────────────────────────
  const [scheduledRuns, setScheduledRuns] = useState<ScheduledRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  const enabledModelCount = Object.values(aiVisibilityEnabledModels).filter(Boolean).length;
  const nextRunDate = useMemo(() => getNextMonday3amUtc(), []);

  const runSummary = useMemo(() => {
    const totalCost = scheduledRuns.reduce((sum, r) => sum + Number(r.total_cost_usd || 0), 0);
    const sites = new Set(scheduledRuns.map((r) => r.blog?.title ?? r.id)).size;
    return { total: scheduledRuns.length, totalCost, sites };
  }, [scheduledRuns]);

  useEffect(() => {
    loadAiVisibilityPolicy();
    loadScheduledRuns();
  }, []);

  // ── Load policy ───────────────────────────────────────────────────────────
  const loadAiVisibilityPolicy = async () => {
    setLoadingAiVisibilityPolicy(true);
    try {
      const { data, error } = await (supabase as any)
        .from("ai_visibility_admin_policy")
        .select("max_cost_usd, enabled_models, weekly_sync_enabled")
        .eq("id", true)
        .maybeSingle();

      if (error) throw error;

      const normalizedValue = Math.max(
        MIN_RUN_COST_USD,
        Number(data?.max_cost_usd ?? DEFAULT_MAX_COST_USD),
      );
      const rawEnabledModels =
        data?.enabled_models && typeof data.enabled_models === "object"
          ? (data.enabled_models as Record<string, unknown>)
          : {};
      const normalizedModels: Record<ProviderKey, boolean> = {
        chat_gpt: rawEnabledModels.chat_gpt !== false,
        gemini: rawEnabledModels.gemini !== false,
        perplexity: rawEnabledModels.perplexity !== false,
      };
      setAiVisibilityMaxCostUsd(String(normalizedValue));
      setAiVisibilityEnabledModels(normalizedModels);
      setWeeklySyncEnabled(data?.weekly_sync_enabled !== false);
    } catch (error: unknown) {
      console.error("Error loading AI visibility policy:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load AI visibility policy");
      setAiVisibilityMaxCostUsd(String(DEFAULT_MAX_COST_USD));
      setAiVisibilityEnabledModels(DEFAULT_ADMIN_ENABLED_MODELS);
      setWeeklySyncEnabled(true);
    } finally {
      setLoadingAiVisibilityPolicy(false);
    }
  };

  // ── Load scheduled run history ────────────────────────────────────────────
  const loadScheduledRuns = async () => {
    setLoadingRuns(true);
    try {
      const { data, error } = await (supabase as any)
        .from("ai_visibility_runs")
        .select("id, started_at, finished_at, status, total_cost_usd, blog:blogs(title, website_homepage)")
        .eq("run_type", "scheduled")
        .order("started_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setScheduledRuns(data || []);
    } catch (error: unknown) {
      console.error("Error loading scheduled runs:", error);
      toast.error("Failed to load scheduled run history");
    } finally {
      setLoadingRuns(false);
    }
  };

  // ── Toggle helpers ────────────────────────────────────────────────────────
  const toggleAiVisibilityModel = (provider: ProviderKey, enabled: boolean) => {
    setAiVisibilityEnabledModels((prev) => ({ ...prev, [provider]: enabled }));
  };

  // ── Save policy ───────────────────────────────────────────────────────────
  const saveAiVisibilityPolicy = async () => {
    const parsedValue = Number(aiVisibilityMaxCostUsd);
    if (Number.isNaN(parsedValue) || parsedValue < MIN_RUN_COST_USD) {
      toast.error(`Max cost cap must be at least ${MIN_RUN_COST_USD} USD`);
      return;
    }

    setSavingAiVisibilityPolicy(true);
    try {
      const sb = supabase as any;
      const { data: authData, error: authError } = await sb.auth.getUser();
      if (authError || !authData?.user?.id) throw new Error("Could not verify current admin user");

      const normalizedValue = Number(parsedValue.toFixed(2));

      const { data: existingPolicy, error: existingPolicyError } = await sb
        .from("ai_visibility_admin_policy")
        .select("max_cost_usd, enabled_models, weekly_sync_enabled")
        .eq("id", true)
        .maybeSingle();
      if (existingPolicyError) throw existingPolicyError;

      const previousBudget = Number(existingPolicy?.max_cost_usd ?? DEFAULT_MAX_COST_USD);
      const previousRaw = existingPolicy?.enabled_models && typeof existingPolicy.enabled_models === "object"
        ? (existingPolicy.enabled_models as Record<string, unknown>)
        : {};
      const previousModels = {
        chat_gpt: previousRaw.chat_gpt !== false,
        gemini: previousRaw.gemini !== false,
        perplexity: previousRaw.perplexity !== false,
      };
      const previousWeekly = existingPolicy?.weekly_sync_enabled !== false;

      const { error } = await sb
        .from("ai_visibility_admin_policy")
        .upsert(
          {
            id: true,
            max_cost_usd: normalizedValue,
            enabled_models: aiVisibilityEnabledModels,
            weekly_sync_enabled: weeklySyncEnabled,
            updated_by: authData.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      if (error) throw error;

      const auditRows: any[] = [];
      if (Number(previousBudget.toFixed(2)) !== normalizedValue) {
        auditRows.push({
          admin_user_id: authData.user.id,
          action_type: "update_ai_visibility_budget_policy",
          target_user_id: authData.user.id,
          details: {
            previous_max_cost_usd: Number(previousBudget.toFixed(2)),
            new_max_cost_usd: normalizedValue,
          },
        });
      }
      if (JSON.stringify(previousModels) !== JSON.stringify(aiVisibilityEnabledModels)) {
        auditRows.push({
          admin_user_id: authData.user.id,
          action_type: "update_ai_visibility_model_policy",
          target_user_id: authData.user.id,
          details: { previous_enabled_models: previousModels, new_enabled_models: aiVisibilityEnabledModels },
        });
      }
      if (previousWeekly !== weeklySyncEnabled) {
        auditRows.push({
          admin_user_id: authData.user.id,
          action_type: "update_ai_visibility_weekly_sync",
          target_user_id: authData.user.id,
          details: { previous_weekly_sync_enabled: previousWeekly, new_weekly_sync_enabled: weeklySyncEnabled },
        });
      }
      if (auditRows.length > 0) {
        const { error: auditError } = await sb.from("admin_actions").insert(auditRows);
        if (auditError) console.error("Failed to write audit log:", auditError);
      }

      setAiVisibilityMaxCostUsd(String(normalizedValue));
      toast.success("AI visibility policy updated");
    } catch (error: unknown) {
      console.error("Error saving AI visibility policy:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save AI visibility policy");
    } finally {
      setSavingAiVisibilityPolicy(false);
    }
  };

  const isDisabled = loadingAiVisibilityPolicy || savingAiVisibilityPolicy;

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      {/* ── Page header ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="px-2.5 py-1">Global Policy</Badge>
          <Badge variant="outline" className="px-2.5 py-1">
            {enabledModelCount}/3 models enabled
          </Badge>
          <Badge variant="outline" className="px-2.5 py-1">
            Cap: ${Number(aiVisibilityMaxCostUsd || DEFAULT_MAX_COST_USD).toFixed(2)}
          </Badge>
          <Badge
            variant={weeklySyncEnabled ? "default" : "secondary"}
            className="px-2.5 py-1"
          >
            Weekly sync: {weeklySyncEnabled ? "active" : "paused"}
          </Badge>
        </div>
        <h1 className="text-3xl font-bold">AI Visibility Admin Controls</h1>
        <p className="text-muted-foreground max-w-2xl">
          Global policies applied across all sites for AI visibility runs.
        </p>
      </div>

      {/* ── Budget + Models ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Budget card */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-emerald-50 dark:bg-emerald-900/20">
                <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </span>
              Budget Policy
            </CardTitle>
            <CardDescription>
              Set the global max spend allowed for each AI visibility sync run across all sites.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How This Works</p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p className="flex items-start gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/80" />
                  Each site can choose its own run budget, but it cannot exceed this cap.
                </p>
                <p className="flex items-start gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/80" />
                  The cap is enforced server-side, so API calls cannot bypass it.
                </p>
                <p className="flex items-start gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/80" />
                  When a run reaches the cap, processing stops safely and partial results remain available.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="ai-visibility-admin-max-cost-usd">
                Max Cost Per Run Cap (USD)
              </label>
              <Input
                id="ai-visibility-admin-max-cost-usd"
                type="number"
                min={String(MIN_RUN_COST_USD)}
                step="0.5"
                value={aiVisibilityMaxCostUsd}
                onChange={(e) => setAiVisibilityMaxCostUsd(e.target.value)}
                disabled={isDisabled}
              />
            </div>
            <div className="rounded-md border border-amber-200/70 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/10 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 mt-0.5" />
                Recommended: keep this high enough for useful coverage, but low enough to avoid accidental spend spikes.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Models card */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-indigo-50 dark:bg-indigo-900/20">
                <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </span>
              Enabled Models Policy
            </CardTitle>
            <CardDescription>
              Control which providers are globally available in AI visibility sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                { key: "chat_gpt" as ProviderKey, label: "ChatGPT", sub: "OpenAI model tracking", logo: "/images/openai.svg" },
                { key: "perplexity" as ProviderKey, label: "Perplexity", sub: "Perplexity answer and sources", logo: "/images/perplexity-color.svg" },
                { key: "gemini" as ProviderKey, label: "Gemini", sub: "Google Gemini responses", logo: "/images/gemini-color.svg" },
              ] as const
            ).map(({ key, label, sub, logo }) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-muted/20"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-background/80">
                    <img src={logo} alt={label} className="h-4 w-4 object-contain" loading="lazy" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{sub}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={aiVisibilityEnabledModels[key] ? "secondary" : "outline"} className="text-[10px]">
                    {aiVisibilityEnabledModels[key] ? "Enabled" : "Disabled"}
                  </Badge>
                  <Switch
                    checked={aiVisibilityEnabledModels[key]}
                    onCheckedChange={(checked) => toggleAiVisibilityModel(key, checked)}
                    disabled={isDisabled}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Weekly schedule control ── */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-blue-50 dark:bg-blue-900/20">
              <CalendarClock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </span>
            Weekly Auto-Sync Schedule
          </CardTitle>
          <CardDescription>
            Controls whether the automated weekly sync runs at all. Individual sites can still be
            paused independently in their site settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border px-4 py-3 transition-colors hover:bg-muted/20">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Enable weekly auto-sync globally</p>
              <p className="text-xs text-muted-foreground">
                Runs every Monday at 03:00 UTC across all non-paused sites.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={weeklySyncEnabled ? "default" : "secondary"}>
                {weeklySyncEnabled ? "Active" : "Paused"}
              </Badge>
              <Switch
                checked={weeklySyncEnabled}
                onCheckedChange={setWeeklySyncEnabled}
                disabled={isDisabled}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-0.5">
              <p className="text-xs text-muted-foreground">Schedule</p>
              <p className="font-medium">Every Monday · 03:00 UTC</p>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-0.5">
              <p className="text-xs text-muted-foreground">Next scheduled run</p>
              <p className="font-medium">
                {weeklySyncEnabled
                  ? nextRunDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + " · 03:00 UTC"
                  : "—"}
              </p>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-0.5">
              <p className="text-xs text-muted-foreground">Total runs recorded</p>
              <p className="font-medium">{loadingRuns ? "…" : runSummary.total}</p>
            </div>
          </div>

          {!weeklySyncEnabled && (
            <div className="rounded-md border border-amber-300/70 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/10 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Weekly auto-sync is paused. The pg_cron job will still trigger on schedule, but the function
                will exit immediately without calling any APIs or incurring cost.
                Save the policy to persist this setting.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Save button ── */}
      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <Button
          variant="outline"
          onClick={() => { loadAiVisibilityPolicy(); loadScheduledRuns(); }}
          disabled={isDisabled}
          className="sm:min-w-[140px]"
        >
          {loadingAiVisibilityPolicy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reload"}
        </Button>
        <Button
          onClick={saveAiVisibilityPolicy}
          disabled={isDisabled}
          className="sm:min-w-[210px]"
        >
          {savingAiVisibilityPolicy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save AI Visibility Policy
        </Button>
      </div>

      {/* ── Scheduled run history ── */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                Scheduled Run History
              </CardTitle>
              <CardDescription>
                All automated weekly syncs across every site. Most recent first, showing up to 100 runs.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadScheduledRuns}
              disabled={loadingRuns}
              className="gap-1.5 shrink-0"
            >
              {loadingRuns
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        </CardHeader>

        {/* Summary stats */}
        {!loadingRuns && scheduledRuns.length > 0 && (
          <div className="border-t px-6 py-3 grid sm:grid-cols-3 gap-4 text-sm bg-muted/20">
            <div>
              <p className="text-xs text-muted-foreground">Total runs</p>
              <p className="font-semibold">{runSummary.total}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total cost (all time)</p>
              <p className="font-semibold flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                {runSummary.totalCost.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Distinct sites synced</p>
              <p className="font-semibold">{runSummary.sites}</p>
            </div>
          </div>
        )}

        <CardContent className="p-0">
          {loadingRuns ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading run history…
            </div>
          ) : scheduledRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
              <CalendarClock className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No scheduled runs yet</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                The first automated run will appear here after the weekly cron triggers on Monday at 03:00 UTC.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Finished</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Cost (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduledRuns.map((run) => {
                    const badgeMeta = STATUS_BADGE[run.status] ?? { label: run.status, variant: "outline" as const };
                    const siteLabel = run.blog?.title || run.blog?.website_homepage || run.id.slice(0, 8);
                    return (
                      <TableRow key={run.id}>
                        <TableCell className="font-medium max-w-[200px] truncate" title={siteLabel}>
                          {siteLabel}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(run.started_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDuration(run.started_at, run.finished_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badgeMeta.variant} className="text-xs">
                            {badgeMeta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${Number(run.total_cost_usd ?? 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
