import { useEffect, useMemo, useState } from "react";
import { useSiteContext } from "@/contexts/SiteContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bot, CalendarDays, ChevronDown, CircleCheck, CircleX, Cpu, DollarSign, Loader2, RefreshCw, Settings, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { DateRange } from "react-day-picker";
import { getCountryByLocationCode, getLanguageByCode } from "@/lib/aiVisibilityTargeting";
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
type TrendDateRange = "24h" | "7d" | "30d" | "3m" | "6m" | "9m" | "12m" | "custom";
type TrendGranularity = "daily" | "weekly" | "monthly" | "yearly";
const TREND_DATE_RANGE_OPTIONS: Array<{ value: TrendDateRange; label: string }> = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "9m", label: "9 months" },
  { value: "12m", label: "12 months" },
  { value: "custom", label: "Custom" },
];
const TREND_GRANULARITY_OPTIONS: Array<{ value: TrendGranularity; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const normalizeEnabledModels = (input: unknown): Record<RunProvider, boolean> => {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    chat_gpt: raw.chat_gpt !== false,
    gemini: raw.gemini !== false,
    perplexity: raw.perplexity !== false,
  };
};

const TREND_SERIES_META: Record<RunProvider, { label: string; color: string }> = {
  chat_gpt: { label: "ChatGPT", color: "hsl(var(--chart-1))" },
  gemini: { label: "Gemini", color: "hsl(var(--chart-2))" },
  perplexity: { label: "Perplexity", color: "hsl(var(--chart-3))" },
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
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
  const [metricHistoryRows, setMetricHistoryRows] = useState<any[]>([]);
  const [activePrompts, setActivePrompts] = useState<string[]>([]);
  const [siteEnabledModels, setSiteEnabledModels] = useState<Record<RunProvider, boolean>>(DEFAULT_ENABLED_MODELS);
  const [adminEnabledModels, setAdminEnabledModels] = useState<Record<RunProvider, boolean>>(DEFAULT_ENABLED_MODELS);
  const [siteMaxCostUsd, setSiteMaxCostUsd] = useState<number | null>(null);
  const [adminMaxCostUsd, setAdminMaxCostUsd] = useState<number | null>(null);
  const [trendDateRange, setTrendDateRange] = useState<TrendDateRange>("7d");
  const [trendCustomDateRange, setTrendCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>("weekly");
  const [trendDatePopoverOpen, setTrendDatePopoverOpen] = useState(false);
  const [draftTrendDateRange, setDraftTrendDateRange] = useState<TrendDateRange>("7d");
  const [draftTrendCustomDateRange, setDraftTrendCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedTrendProviders, setSelectedTrendProviders] = useState<RunProvider[]>(RUN_PROVIDER_KEYS);

  const hasSite = useMemo(() => Boolean(blogId), [blogId]);
  const activePromptCount = useMemo(() => activePrompts.length, [activePrompts]);
  const hasActivePrompts = useMemo(() => activePromptCount > 0, [activePromptCount]);
  const mentionCount = useMemo(() => mentions.length, [mentions]);
  const detectedMentions = useMemo(() => mentions.filter((m) => Boolean(m.detected_brand)).length, [mentions]);
  const latestRunLanguage = useMemo(() => {
    const code = String(latestRun?.effective_language_code || "").toLowerCase();
    if (!code) return null;
    const known = getLanguageByCode(code);
    return known ? `${known.name} (${known.code})` : code;
  }, [latestRun]);
  const latestRunCountry = useMemo(() => {
    const code = Number(latestRun?.effective_location_code);
    if (!Number.isFinite(code) || code <= 0) return null;
    const known = getCountryByLocationCode(code);
    return known ? `${known.name} (${known.iso2})` : String(code);
  }, [latestRun]);
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
  const trendDateBounds = useMemo(() => {
    const now = Date.now();
    const startMs = (() => {
      switch (trendDateRange) {
        case "24h":
          return now - 24 * 60 * 60 * 1000;
        case "7d":
          return now - 7 * 24 * 60 * 60 * 1000;
        case "30d":
          return now - 30 * 24 * 60 * 60 * 1000;
        case "3m":
          return now - 90 * 24 * 60 * 60 * 1000;
        case "6m":
          return now - 180 * 24 * 60 * 60 * 1000;
        case "9m":
          return now - 270 * 24 * 60 * 60 * 1000;
        case "12m":
          return now - 365 * 24 * 60 * 60 * 1000;
        case "custom":
          return trendCustomDateRange?.from
            ? startOfDay(trendCustomDateRange.from).getTime()
            : now - 7 * 24 * 60 * 60 * 1000;
        default:
          return now - 7 * 24 * 60 * 60 * 1000;
      }
    })();
    const endMs =
      trendDateRange === "custom" && trendCustomDateRange?.to
        ? endOfDay(trendCustomDateRange.to).getTime()
        : now;
    return { startMs, endMs };
  }, [trendDateRange, trendCustomDateRange]);

  const filteredTrendRunCount = useMemo(() => {
    const runIds = new Set<string>();
    for (const row of metricHistoryRows) {
      const startedAtRaw = row?.run?.started_at || row.created_at;
      const startedAt = startedAtRaw ? new Date(startedAtRaw) : null;
      if (!startedAt || Number.isNaN(startedAt.getTime())) continue;
      const ts = startedAt.getTime();
      if (ts < trendDateBounds.startMs || ts > trendDateBounds.endMs) continue;
      const runId = String(row.run_id || "");
      if (runId) runIds.add(runId);
    }
    return runIds.size;
  }, [metricHistoryRows, trendDateBounds]);

  const filteredRunTrendData = useMemo(() => {
    if (metricHistoryRows.length === 0) return [];
    const pointsByRun = new Map<string, Record<string, number | string>>();

    for (const row of metricHistoryRows) {
      const provider = String(row.provider || "").toLowerCase() as RunProvider;
      if (!RUN_PROVIDER_KEYS.includes(provider)) continue;

      const startedAtRaw = row?.run?.started_at || row.created_at;
      const startedAt = startedAtRaw ? new Date(startedAtRaw) : null;
      if (!startedAt || Number.isNaN(startedAt.getTime())) continue;
      if (startedAt.getTime() < trendDateBounds.startMs || startedAt.getTime() > trendDateBounds.endMs) continue;

      const runId = String(row.run_id || row.id || "");
      if (!runId) continue;

      const existing = pointsByRun.get(runId) || {
        label:
          trendDateRange === "24h"
            ? startedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })
            : startedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        timestampLabel: startedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        sortValue: startedAt.getTime(),
      };

      const visibility = Number(row.visibility_score);
      const sov = Number(row.share_of_voice);
      if (Number.isFinite(visibility)) {
        existing[`${provider}_visibility`] = Number((visibility * 100).toFixed(2));
      }
      if (Number.isFinite(sov)) {
        existing[`${provider}_sov`] = Number((sov * 100).toFixed(2));
      }

      pointsByRun.set(runId, existing);
    }

    return Array.from(pointsByRun.values()).sort((a, b) => Number(a.sortValue) - Number(b.sortValue));
  }, [metricHistoryRows, trendDateBounds, trendDateRange]);
  const visibleTrendData = useMemo(() => {
    if (filteredRunTrendData.length === 0) return [];
    if (trendGranularity === "daily") return filteredRunTrendData;

    const getBucketStart = (date: Date) => {
      const d = new Date(date);
      if (trendGranularity === "weekly") {
        const day = d.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        d.setDate(d.getDate() - diffToMonday);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      if (trendGranularity === "monthly") {
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const formatBucketLabel = (date: Date) => {
      if (trendGranularity === "weekly") {
        return `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      }
      if (trendGranularity === "monthly") {
        return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      }
      return date.toLocaleDateString("en-US", { year: "numeric" });
    };

    const bucketMap = new Map<string, Record<string, number | string>>();
    for (const row of filteredRunTrendData) {
      const sortValue = Number(row.sortValue || 0);
      if (!Number.isFinite(sortValue) || sortValue <= 0) continue;
      const bucketStart = getBucketStart(new Date(sortValue));
      const bucketKey = String(bucketStart.getTime());
      const existing = bucketMap.get(bucketKey) || {
        label: formatBucketLabel(bucketStart),
        sortValue: bucketStart.getTime(),
      };

      for (const provider of RUN_PROVIDER_KEYS) {
        const visibility = Number(row[`${provider}_visibility`]);
        if (Number.isFinite(visibility)) {
          existing[`${provider}_visibility_sum`] = Number(existing[`${provider}_visibility_sum`] || 0) + visibility;
          existing[`${provider}_visibility_count`] = Number(existing[`${provider}_visibility_count`] || 0) + 1;
        }
        const sov = Number(row[`${provider}_sov`]);
        if (Number.isFinite(sov)) {
          existing[`${provider}_sov_sum`] = Number(existing[`${provider}_sov_sum`] || 0) + sov;
          existing[`${provider}_sov_count`] = Number(existing[`${provider}_sov_count`] || 0) + 1;
        }
      }
      bucketMap.set(bucketKey, existing);
    }

    return Array.from(bucketMap.values())
      .sort((a, b) => Number(a.sortValue) - Number(b.sortValue))
      .map((bucket) => {
        const point: Record<string, number | string> = {
          label: String(bucket.label || ""),
          sortValue: Number(bucket.sortValue || 0),
        };
        for (const provider of RUN_PROVIDER_KEYS) {
          const visibilityCount = Number(bucket[`${provider}_visibility_count`] || 0);
          const visibilitySum = Number(bucket[`${provider}_visibility_sum`] || 0);
          if (visibilityCount > 0) {
            point[`${provider}_visibility`] = Number((visibilitySum / visibilityCount).toFixed(2));
          }
          const sovCount = Number(bucket[`${provider}_sov_count`] || 0);
          const sovSum = Number(bucket[`${provider}_sov_sum`] || 0);
          if (sovCount > 0) {
            point[`${provider}_sov`] = Number((sovSum / sovCount).toFixed(2));
          }
        }
        return point;
      });
  }, [filteredRunTrendData, trendGranularity]);
  const plannedProviders = useMemo(
    () =>
      RUN_PROVIDER_KEYS.filter(
        (provider) => adminEnabledModels[provider] !== false && siteEnabledModels[provider] !== false,
      ),
    [adminEnabledModels, siteEnabledModels],
  );
  const availableTrendProviders = useMemo(() => plannedProviders, [plannedProviders]);
  const visibleTrendProviders = useMemo(
    () => availableTrendProviders.filter((provider) => selectedTrendProviders.includes(provider)),
    [availableTrendProviders, selectedTrendProviders],
  );
  const allAvailableTrendProvidersSelected = useMemo(
    () =>
      availableTrendProviders.length > 0 && availableTrendProviders.every((provider) => selectedTrendProviders.includes(provider)),
    [availableTrendProviders, selectedTrendProviders],
  );
  const modelFilterLabel = useMemo(() => {
    if (availableTrendProviders.length === 0) return "No Models Available";
    if (allAvailableTrendProvidersSelected) return "All Models";
    if (visibleTrendProviders.length === 0) return "No Models Selected";
    if (visibleTrendProviders.length === 1) return TREND_SERIES_META[visibleTrendProviders[0]].label;
    return `${visibleTrendProviders.length} Models`;
  }, [allAvailableTrendProvidersSelected, availableTrendProviders.length, visibleTrendProviders]);
  const trendChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    for (const provider of visibleTrendProviders) {
      config[`${provider}_visibility`] = {
        label: TREND_SERIES_META[provider].label,
        color: TREND_SERIES_META[provider].color,
      };
      config[`${provider}_sov`] = {
        label: TREND_SERIES_META[provider].label,
        color: TREND_SERIES_META[provider].color,
      };
    }
    return config;
  }, [visibleTrendProviders]);
  const hasTrendData = useMemo(() => visibleTrendData.length > 0, [visibleTrendData]);
  const hasRenderableTrendSeries = useMemo(
    () => visibleTrendProviders.length > 0 && Object.keys(trendChartConfig).length > 0,
    [visibleTrendProviders, trendChartConfig],
  );
  const trendDateRangeLabel = useMemo(
    () => {
      if (trendDateRange === "custom" && trendCustomDateRange?.from && trendCustomDateRange?.to) {
        const from = trendCustomDateRange.from.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const to = trendCustomDateRange.to.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return `${from} - ${to}`;
      }
      return TREND_DATE_RANGE_OPTIONS.find((option) => option.value === trendDateRange)?.label || "7 days";
    },
    [trendDateRange, trendCustomDateRange],
  );
  const trendGranularityLabel = useMemo(
    () => TREND_GRANULARITY_OPTIONS.find((option) => option.value === trendGranularity)?.label || "Weekly",
    [trendGranularity],
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
        { data: metricsHistoryData },
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
          .from("ai_visibility_model_metrics")
          .select("id, run_id, provider, visibility_score, share_of_voice, created_at, run:ai_visibility_runs(started_at)")
          .eq("blog_id", blogId)
          .order("created_at", { ascending: true })
          .limit(200),
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
      setMetricHistoryRows(metricsHistoryData || []);

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

  useEffect(() => {
    setSelectedTrendProviders((prev) => {
      const allowed = prev.filter((provider) => availableTrendProviders.includes(provider));
      if (allowed.length > 0) return allowed;
      return availableTrendProviders.length > 0 ? [...availableTrendProviders] : [];
    });
  }, [availableTrendProviders]);

  useEffect(() => {
    if (!trendDatePopoverOpen) return;
    setDraftTrendDateRange(trendDateRange);
    setDraftTrendCustomDateRange(trendCustomDateRange);
  }, [trendDatePopoverOpen, trendDateRange, trendCustomDateRange]);

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

  const toggleTrendProvider = (provider: RunProvider, checked: boolean) => {
    setSelectedTrendProviders((prev) => {
      if (checked) {
        return prev.includes(provider) ? prev : [...prev, provider];
      }
      return prev.filter((item) => item !== provider);
    });
  };

  const toggleAllTrendProviders = (checked: boolean) => {
    setSelectedTrendProviders(checked ? [...availableTrendProviders] : []);
  };

  const applyTrendDateFilters = () => {
    setTrendDateRange(draftTrendDateRange);
    if (draftTrendDateRange === "custom") {
      setTrendCustomDateRange(draftTrendCustomDateRange);
    }
    setTrendDatePopoverOpen(false);
  };

  const setTodayDraftDateRange = () => {
    const today = new Date();
    setDraftTrendDateRange("custom");
    setDraftTrendCustomDateRange({ from: startOfDay(today), to: endOfDay(today) });
  };

  const handleSelectTrendPreset = (value: TrendDateRange) => {
    setDraftTrendDateRange(value);
    if (value === "custom") return;
    setDraftTrendCustomDateRange(undefined);
    setTrendCustomDateRange(undefined);
    setTrendDateRange(value);
    setTrendDatePopoverOpen(false);
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
        <CardContent className="grid md:grid-cols-5 gap-4 text-sm">
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
          <div>
            <p className="text-muted-foreground">Targeting</p>
            <p className="font-medium">
              {latestRunLanguage || latestRunCountry
                ? `${latestRunLanguage || "-"} • ${latestRunCountry || "-"}`
                : "-"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Visibility Trend</CardTitle>
                <CardDescription>
                  See how often your brand is mentioned over time, broken down by model.
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    {modelFilterLabel}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel>Models</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={allAvailableTrendProvidersSelected}
                    disabled={availableTrendProviders.length === 0}
                    onCheckedChange={(checked) => toggleAllTrendProviders(Boolean(checked))}
                  >
                    All Models
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {RUN_PROVIDER_KEYS.map((provider) => {
                    const isAvailable = availableTrendProviders.includes(provider);
                    return (
                      <DropdownMenuCheckboxItem
                        key={`model-filter-${provider}`}
                        checked={selectedTrendProviders.includes(provider)}
                        disabled={!isAvailable}
                        onCheckedChange={(checked) => toggleTrendProvider(provider, Boolean(checked))}
                      >
                        <span className="flex items-center gap-2">
                          {PROVIDER_META[provider]?.logoSrc ? (
                            <img
                              src={PROVIDER_META[provider].logoSrc}
                              alt={TREND_SERIES_META[provider].label}
                              className="h-3.5 w-3.5 object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <Bot className="h-3.5 w-3.5" />
                          )}
                          {TREND_SERIES_META[provider].label}
                        </span>
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              <Popover open={trendDatePopoverOpen} onOpenChange={setTrendDatePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {trendDateRangeLabel}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <div className="flex min-w-[520px]">
                    <div className="w-44 border-r bg-muted/20 p-2">
                      {TREND_DATE_RANGE_OPTIONS.map((option) => (
                        <Button
                          key={`trend-preset-${option.value}`}
                          variant={draftTrendDateRange === option.value ? "secondary" : "ghost"}
                          size="sm"
                          className="mb-1 h-8 w-full justify-start text-sm"
                          onClick={() => handleSelectTrendPreset(option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    <div className="flex-1 p-3">
                      <Calendar
                        mode="range"
                        selected={draftTrendCustomDateRange}
                        defaultMonth={draftTrendCustomDateRange?.from}
                        onSelect={(range) => {
                          setDraftTrendDateRange("custom");
                          setDraftTrendCustomDateRange(range);
                        }}
                        numberOfMonths={1}
                      />
                      <div className="mt-2 space-y-1 rounded-md border bg-muted/20 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">From:</span>
                          <span className="font-medium">
                            {draftTrendCustomDateRange?.from
                              ? draftTrendCustomDateRange.from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                              : "-"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">To:</span>
                          <span className="font-medium">
                            {draftTrendCustomDateRange?.to
                              ? draftTrendCustomDateRange.to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                              : "-"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={setTodayDraftDateRange}>
                          Today
                        </Button>
                        <Button size="sm" className="flex-1" onClick={applyTrendDateFilters}>
                          Apply
                        </Button>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    {trendGranularityLabel}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuLabel>Granularity</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={trendGranularity}
                    onValueChange={(value) => setTrendGranularity(value as TrendGranularity)}
                  >
                    {TREND_GRANULARITY_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem key={`granularity-${option.value}`} value={option.value}>
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

            </div>
            <p className="text-xs text-muted-foreground">
              Date range selects runs; granularity groups selected runs into chart buckets.
            </p>
          </CardHeader>
          <CardContent>
            {hasTrendData && hasRenderableTrendSeries ? (
              <ChartContainer config={trendChartConfig} className="h-[260px] w-full">
                <LineChart data={visibleTrendData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-muted-foreground">{trendChartConfig[String(name)]?.label || String(name)}</span>
                            <span className="font-medium">{Number(value).toFixed(1)}%</span>
                          </div>
                        )}
                      />
                    }
                  />
                  {visibleTrendProviders.map((provider) => (
                    <Line
                      key={`${provider}-visibility`}
                      type="monotone"
                      dataKey={`${provider}_visibility`}
                      stroke={TREND_SERIES_META[provider].color}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            ) : hasTrendData ? (
              <p className="text-sm text-muted-foreground">
                Trend history is available, but no enabled model series can be rendered. Re-enable at least one model in settings.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Run manual sync during the selected range to see visibility trends.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Share of Voice Trend</CardTitle>
                <CardDescription>
                  Compare your share of voice over time, segmented by model.
                </CardDescription>
              </div>
              <div className="text-xs text-muted-foreground pt-2">
                {filteredTrendRunCount} runs, {visibleTrendData.length} points, {trendGranularityLabel.toLowerCase()} buckets
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {hasTrendData && hasRenderableTrendSeries ? (
              <ChartContainer config={trendChartConfig} className="h-[260px] w-full">
                <LineChart data={visibleTrendData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-muted-foreground">{trendChartConfig[String(name)]?.label || String(name)}</span>
                            <span className="font-medium">{Number(value).toFixed(1)}%</span>
                          </div>
                        )}
                      />
                    }
                  />
                  {visibleTrendProviders.map((provider) => (
                    <Line
                      key={`${provider}-sov`}
                      type="monotone"
                      dataKey={`${provider}_sov`}
                      stroke={TREND_SERIES_META[provider].color}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            ) : hasTrendData ? (
              <p className="text-sm text-muted-foreground">
                Trend history is available, but no enabled model series can be rendered. Re-enable at least one model in settings.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Run manual sync during the selected range to see SOV trends.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
      </div>

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

