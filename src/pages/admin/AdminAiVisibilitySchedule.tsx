import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Globe,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SiteScheduleRow {
  blog_id: string;
  is_paused: boolean;
  weekly_sync_enabled: boolean;
  last_scheduled_sync_at: string | null;
  blog: {
    title: string | null;
    website_homepage: string | null;
    company_name: string | null;
  } | null;
}

interface ScheduledRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  total_cost_usd: number;
  blog: { title: string | null; website_homepage: string | null } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNextMonday3amUtc(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, 3, 0, 0, 0),
  );
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

function siteLabel(row: SiteScheduleRow): string {
  return row.blog?.title || row.blog?.company_name || row.blog?.website_homepage || row.blog_id.slice(0, 8);
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  completed:      { label: "Completed",  variant: "default" },
  partial:        { label: "Partial",    variant: "secondary" },
  stopped_budget: { label: "Budget cap", variant: "secondary" },
  running:        { label: "Running",    variant: "secondary" },
  failed:         { label: "Failed",     variant: "destructive" },
  error:          { label: "Error",      variant: "destructive" },
  paused:         { label: "Paused",     variant: "outline" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminAiVisibilitySchedule() {
  // Global policy
  const [weeklySyncEnabled, setWeeklySyncEnabled] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [loadingPolicy, setLoadingPolicy] = useState(true);

  // Per-site list
  const [sites, setSites] = useState<SiteScheduleRow[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [togglingBlogId, setTogglingBlogId] = useState<string | null>(null);

  // Run history
  const [scheduledRuns, setScheduledRuns] = useState<ScheduledRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  const nextRunDate = useMemo(() => getNextMonday3amUtc(), []);

  const includedCount = useMemo(
    () => sites.filter((s) => s.weekly_sync_enabled && !s.is_paused).length,
    [sites],
  );
  const excludedCount = useMemo(
    () => sites.filter((s) => !s.weekly_sync_enabled).length,
    [sites],
  );
  const sitesPausedCount = useMemo(
    () => sites.filter((s) => s.is_paused).length,
    [sites],
  );

  const runSummary = useMemo(() => {
    const totalCost = scheduledRuns.reduce((sum, r) => sum + Number(r.total_cost_usd || 0), 0);
    const distinctSites = new Set(scheduledRuns.map((r) => r.blog?.title ?? r.id)).size;
    return { total: scheduledRuns.length, totalCost, distinctSites };
  }, [scheduledRuns]);

  useEffect(() => {
    loadPolicy();
    loadSites();
    loadScheduledRuns();
  }, []);

  // ── Load global policy ──────────────────────────────────────────────────────
  const loadPolicy = async () => {
    setLoadingPolicy(true);
    try {
      const { data, error } = await (supabase as any)
        .from("ai_visibility_admin_policy")
        .select("weekly_sync_enabled")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      setWeeklySyncEnabled(data?.weekly_sync_enabled !== false);
    } catch (err) {
      console.error("Error loading policy:", err);
      toast.error("Failed to load global schedule policy");
    } finally {
      setLoadingPolicy(false);
    }
  };

  // ── Save global toggle ──────────────────────────────────────────────────────
  const savePolicy = async (newValue: boolean) => {
    setSavingPolicy(true);
    try {
      const sb = supabase as any;
      const { data: authData, error: authError } = await sb.auth.getUser();
      if (authError || !authData?.user?.id) throw new Error("Could not verify admin user");

      const { data: existing } = await sb
        .from("ai_visibility_admin_policy")
        .select("weekly_sync_enabled")
        .eq("id", true)
        .maybeSingle();
      const previous = existing?.weekly_sync_enabled !== false;

      const { error } = await sb
        .from("ai_visibility_admin_policy")
        .upsert(
          { id: true, weekly_sync_enabled: newValue, updated_by: authData.user.id, updated_at: new Date().toISOString() },
          { onConflict: "id" },
        );
      if (error) throw error;

      if (previous !== newValue) {
        await sb.from("admin_actions").insert({
          admin_user_id: authData.user.id,
          action_type: "update_ai_visibility_weekly_sync",
          target_user_id: authData.user.id,
          details: { previous_weekly_sync_enabled: previous, new_weekly_sync_enabled: newValue },
        });
      }

      setWeeklySyncEnabled(newValue);
      toast.success(newValue ? "Weekly auto-sync enabled" : "Weekly auto-sync paused");
    } catch (err) {
      console.error("Error saving policy:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save policy");
      setWeeklySyncEnabled(!newValue); // revert optimistic
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleGlobalToggle = (checked: boolean) => {
    setWeeklySyncEnabled(checked); // optimistic
    savePolicy(checked);
  };

  // ── Load per-site list ──────────────────────────────────────────────────────
  const loadSites = async () => {
    setLoadingSites(true);
    try {
      const { data, error } = await (supabase as any)
        .from("ai_visibility_settings")
        .select("blog_id, is_paused, weekly_sync_enabled, last_scheduled_sync_at, blog:blogs(title, website_homepage, company_name)")
        .order("blog_id");
      if (error) throw error;
      setSites(data || []);
    } catch (err) {
      console.error("Error loading sites:", err);
      toast.error("Failed to load site list");
    } finally {
      setLoadingSites(false);
    }
  };

  // ── Toggle per-site weekly sync ─────────────────────────────────────────────
  const toggleSiteWeeklySync = async (blogId: string, enabled: boolean) => {
    setTogglingBlogId(blogId);
    // Optimistic update
    setSites((prev) =>
      prev.map((s) => (s.blog_id === blogId ? { ...s, weekly_sync_enabled: enabled } : s)),
    );
    try {
      const { error } = await (supabase as any)
        .from("ai_visibility_settings")
        .update({ weekly_sync_enabled: enabled })
        .eq("blog_id", blogId);
      if (error) throw error;
      toast.success(enabled ? "Site included in weekly sync" : "Site excluded from weekly sync");
    } catch (err) {
      console.error("Error toggling site weekly sync:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update site");
      // Revert
      setSites((prev) =>
        prev.map((s) => (s.blog_id === blogId ? { ...s, weekly_sync_enabled: !enabled } : s)),
      );
    } finally {
      setTogglingBlogId(null);
    }
  };

  // ── Load run history ────────────────────────────────────────────────────────
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
    } catch (err) {
      console.error("Error loading scheduled runs:", err);
      toast.error("Failed to load run history");
    } finally {
      setLoadingRuns(false);
    }
  };

  const refreshAll = () => {
    loadPolicy();
    loadSites();
    loadScheduledRuns();
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto py-8 px-4 space-y-6">

      {/* ── Header ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="px-2.5 py-1">Admin</Badge>
          <Badge variant={weeklySyncEnabled ? "default" : "secondary"} className="px-2.5 py-1">
            Weekly sync: {weeklySyncEnabled ? "active" : "paused"}
          </Badge>
          {!loadingSites && (
            <Badge variant="outline" className="px-2.5 py-1">
              {includedCount} of {sites.length} sites included
            </Badge>
          )}
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Weekly Auto-Sync Schedule</h1>
            <p className="text-muted-foreground max-w-2xl mt-1">
              Control the global weekly run and choose exactly which sites participate.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={loadingPolicy || loadingSites || loadingRuns} className="gap-1.5 shrink-0">
            {(loadingPolicy || loadingSites || loadingRuns)
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh all
          </Button>
        </div>
      </div>

      {/* ── Global toggle ── */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-blue-50 dark:bg-blue-900/20">
              <CalendarClock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </span>
            Global Schedule Control
          </CardTitle>
          <CardDescription>
            Master switch for the weekly cron. When paused, the job fires but returns immediately
            at zero cost — no API calls are made.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border px-4 py-3 hover:bg-muted/20 transition-colors">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Enable weekly auto-sync globally</p>
              <p className="text-xs text-muted-foreground">
                Runs every Monday at 03:00 UTC across all non-paused, included sites.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={weeklySyncEnabled ? "default" : "secondary"}>
                {weeklySyncEnabled ? "Active" : "Paused"}
              </Badge>
              <Switch
                checked={weeklySyncEnabled}
                onCheckedChange={handleGlobalToggle}
                disabled={loadingPolicy || savingPolicy}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-0.5">
              <p className="text-xs text-muted-foreground">Schedule</p>
              <p className="font-medium">Every Monday · 03:00 UTC</p>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-0.5">
              <p className="text-xs text-muted-foreground">Next run</p>
              <p className="font-medium">
                {weeklySyncEnabled
                  ? nextRunDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + " · 03:00 UTC"
                  : "—"}
              </p>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-0.5">
              <p className="text-xs text-muted-foreground">Sites in next run</p>
              <p className="font-medium">
                {loadingSites ? "…" : weeklySyncEnabled ? `${includedCount} site${includedCount !== 1 ? "s" : ""}` : "—"}
              </p>
            </div>
          </div>

          {!weeklySyncEnabled && (
            <div className="rounded-md border border-amber-300/70 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/10 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Weekly auto-sync is paused globally. All per-site settings are preserved and will apply
                when you re-enable. Changes save immediately.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Per-site control ── */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Site-by-Site Control
              </CardTitle>
          <CardDescription>
              Choose which sites participate in the weekly run. Toggling a site off here only
              affects the automated schedule — manual syncs still work normally.
              Only sites that have AI Visibility configured in their settings appear below.
            </CardDescription>
            </div>
            {!loadingSites && sites.length > 0 && (
              <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground pt-1">
                <span className="text-green-600 dark:text-green-400 font-medium">{includedCount} included</span>
                {excludedCount > 0 && <span>·</span>}
                {excludedCount > 0 && <span className="text-amber-600 dark:text-amber-400 font-medium">{excludedCount} excluded</span>}
                {sitesPausedCount > 0 && <span>·</span>}
                {sitesPausedCount > 0 && <span className="text-muted-foreground">{sitesPausedCount} site-paused</span>}
              </div>
            )}
          </div>
        </CardHeader>
        <div className="border-t px-6 py-3 flex items-start gap-2 text-xs text-muted-foreground bg-muted/20">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Only sites that have AI Visibility set up (via Site Settings → AI Visibility) appear here.
          Sites not yet configured are excluded from the weekly run automatically and won't show in this list.
        </div>

        <CardContent className="p-0">
          {loadingSites ? (
            <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sites…
            </div>
          ) : sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
              <Globe className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No sites configured yet</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Sites appear here once a user sets up AI Visibility in their site settings.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Last scheduled sync</TableHead>
                    <TableHead>Site status</TableHead>
                    <TableHead className="text-center">Include in weekly run</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sites.map((site) => {
                    const label = siteLabel(site);
                    const isToggling = togglingBlogId === site.blog_id;
                    return (
                      <TableRow key={site.blog_id} className={!site.weekly_sync_enabled ? "opacity-60" : ""}>
                        <TableCell className="font-medium max-w-[180px] truncate" title={label}>
                          {label}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                          {site.blog?.website_homepage || "—"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {site.last_scheduled_sync_at
                            ? new Date(site.last_scheduled_sync_at).toLocaleString()
                            : <span className="text-muted-foreground">Never</span>}
                        </TableCell>
                        <TableCell>
                          {site.is_paused ? (
                            <Badge variant="secondary" className="text-xs">Site paused</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-green-600 border-green-300 dark:text-green-400 dark:border-green-800">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            {isToggling && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                            <Switch
                              checked={site.weekly_sync_enabled}
                              onCheckedChange={(checked) => toggleSiteWeeklySync(site.blog_id, checked)}
                              disabled={isToggling}
                            />
                          </div>
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

      {/* ── Run history ── */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                Scheduled Run History
              </CardTitle>
              <CardDescription>
                All automated weekly syncs across every site. Most recent first, up to 100 runs.
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
              <p className="font-semibold">{runSummary.distinctSites}</p>
            </div>
          </div>
        )}

        <CardContent className="p-0">
          {loadingRuns ? (
            <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
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
                    const meta = STATUS_BADGE[run.status] ?? { label: run.status, variant: "outline" as const };
                    const name = run.blog?.title || run.blog?.website_homepage || run.id.slice(0, 8);
                    return (
                      <TableRow key={run.id}>
                        <TableCell className="font-medium max-w-[180px] truncate" title={name}>
                          {name}
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
                          <Badge variant={meta.variant} className="text-xs">{meta.label}</Badge>
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
