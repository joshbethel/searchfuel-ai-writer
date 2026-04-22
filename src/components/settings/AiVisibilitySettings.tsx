import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowUpRight, CirclePause, Cpu, DollarSign, Globe, Loader2, Lock, MessageSquareText, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AiVisibilitySettingsProps {
  blogId: string;
}

type ProviderKey = "chat_gpt" | "gemini" | "perplexity";
const MIN_RUN_COST_USD = 1;
const DEFAULT_MAX_COST_USD = 5;
const ADMIN_MAX_COST_USD = Math.max(
  MIN_RUN_COST_USD,
  Number(import.meta.env.VITE_AI_VISIBILITY_ADMIN_MAX_COST_USD || DEFAULT_MAX_COST_USD),
);

const DEFAULT_MODELS: Record<ProviderKey, boolean> = {
  chat_gpt: true,
  gemini: true,
  perplexity: true,
};

const MODEL_CARDS: Array<{
  id: ProviderKey | "ai_overviews" | "ai_mode" | "claude" | "grok" | "copilot";
  label: string;
  availability: "enabled" | "upgrade";
  logoSrc: string;
  description: string;
}> = [
  { id: "chat_gpt", label: "ChatGPT", availability: "enabled", logoSrc: "/images/openai.svg", description: "Track direct LLM responses." },
  { id: "perplexity", label: "Perplexity", availability: "enabled", logoSrc: "/images/perplexity-color.svg", description: "Track answer and source behavior." },
  { id: "gemini", label: "Gemini", availability: "enabled", logoSrc: "/images/gemini-color.svg", description: "Track Gemini-generated recommendations." },
  { id: "ai_overviews", label: "AI Overviews", availability: "upgrade", logoSrc: "/images/ai-overviews.svg", description: "Coming in a later plan tier." },
  { id: "ai_mode", label: "AI Mode", availability: "upgrade", logoSrc: "/images/ai-mode.svg", description: "Coming in a later plan tier." },
  { id: "claude", label: "Claude", availability: "upgrade", logoSrc: "/images/claude.svg", description: "Coming in a later plan tier." },
  { id: "grok", label: "Grok", availability: "upgrade", logoSrc: "/images/grok.svg", description: "Coming in a later plan tier." },
  { id: "copilot", label: "Copilot", availability: "upgrade", logoSrc: "/images/copilot-color.svg", description: "Coming in a later plan tier." },
];

const clampRunCost = (input: unknown) => {
  const parsed = Number(input);
  if (Number.isNaN(parsed)) return DEFAULT_MAX_COST_USD;
  return Math.min(Math.max(parsed, MIN_RUN_COST_USD), ADMIN_MAX_COST_USD);
};

export function AiVisibilitySettings({ blogId }: AiVisibilitySettingsProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mainPrompt, setMainPrompt] = useState("");
  const [mainKeyword, setMainKeyword] = useState("");
  const [languageCode, setLanguageCode] = useState("en");
  const [locationCode, setLocationCode] = useState("2840");
  const [isPaused, setIsPaused] = useState(false);
  const [maxCostUsd, setMaxCostUsd] = useState("5");
  const [promptsText, setPromptsText] = useState("");
  const [models, setModels] = useState<Record<ProviderKey, boolean>>(DEFAULT_MODELS);

  const prompts = useMemo(
    () =>
      promptsText
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean),
    [promptsText],
  );
  const enabledModelCount = useMemo(() => Object.values(models).filter(Boolean).length, [models]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const sb = supabase as any;
        const [{ data: settings }, { data: promptsRows }] = await Promise.all([
          sb.from("ai_visibility_settings").select("*").eq("blog_id", blogId).maybeSingle(),
          sb
            .from("ai_visibility_prompts")
            .select("prompt_text, sort_order")
            .eq("blog_id", blogId)
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
        ]);

        if (settings) {
          setMainPrompt(settings.main_ai_prompt || "");
          setMainKeyword(settings.main_keyword || "");
          setLanguageCode(settings.language_code || "en");
          setLocationCode(String(settings.location_code || 2840));
          setIsPaused(Boolean(settings.is_paused));
          setMaxCostUsd(String(clampRunCost(settings.max_cost_usd ?? DEFAULT_MAX_COST_USD)));
          setModels({ ...DEFAULT_MODELS, ...(settings.enabled_models || {}) });
        }

        if (Array.isArray(promptsRows) && promptsRows.length > 0) {
          setPromptsText(promptsRows.map((r: any) => r.prompt_text).join("\n"));
        } else if (settings?.main_ai_prompt) {
          setPromptsText(settings.main_ai_prompt);
        }
      } catch (error) {
        console.error("Error loading AI visibility settings:", error);
        toast.error("Failed to load AI visibility settings");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [blogId]);

  const toggleModel = (model: ProviderKey, checked: boolean) => {
    setModels((prev) => ({ ...prev, [model]: checked }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const sb = supabase as any;
      const parsedLocation = Number(locationCode || "2840");
      const parsedBudget = Number(maxCostUsd || String(DEFAULT_MAX_COST_USD));

      if (Number.isNaN(parsedLocation) || parsedLocation <= 0) {
        toast.error("Location code must be a positive number");
        return;
      }

      if (Number.isNaN(parsedBudget) || parsedBudget < MIN_RUN_COST_USD) {
        toast.error(`Max cost must be at least ${MIN_RUN_COST_USD}`);
        return;
      }

      const normalizedBudget = clampRunCost(parsedBudget);
      if (normalizedBudget !== parsedBudget) {
        toast.info(`Max cost was adjusted to ${normalizedBudget} based on admin policy.`);
      }
      setMaxCostUsd(String(normalizedBudget));

      const { error: settingsError } = await sb.from("ai_visibility_settings").upsert(
        {
          blog_id: blogId,
          main_ai_prompt: mainPrompt || null,
          main_keyword: mainKeyword || null,
          language_code: languageCode || "en",
          location_code: parsedLocation,
          enabled_models: models,
          is_paused: isPaused,
          max_cost_usd: normalizedBudget,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "blog_id" },
      );

      if (settingsError) throw settingsError;

      // Replace prompts with current text list.
      const { error: deactivateError } = await sb
        .from("ai_visibility_prompts")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("blog_id", blogId);

      if (deactivateError) throw deactivateError;

      if (prompts.length > 0) {
        const promptPayload = prompts.map((prompt, index) => ({
          blog_id: blogId,
          prompt_text: prompt,
          is_active: true,
          sort_order: index,
          updated_at: new Date().toISOString(),
        }));

        const { error: promptsError } = await sb.from("ai_visibility_prompts").upsert(promptPayload, {
          onConflict: "blog_id,prompt_text",
        });

        if (promptsError) throw promptsError;
      }

      toast.success("AI visibility settings saved");
    } catch (error: any) {
      console.error("Error saving AI visibility settings:", error);
      toast.error(`Failed to save settings: ${error?.message ?? "Unknown error"}`);
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              AI Visibility
            </CardTitle>
            <CardDescription>Configure prompts, targeting, model tracking, pause state, and run budget guardrails.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => navigate("/ai-visibility")}
          >
            <ArrowUpRight className="h-4 w-4 mr-2" />
            Open AI Visibility
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Tracked Prompts</p>
            <p className="mt-1 text-lg font-semibold">{prompts.length}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Enabled Models</p>
            <p className="mt-1 text-lg font-semibold">{enabledModelCount}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Max Run Cost</p>
            <p className="mt-1 text-lg font-semibold">${clampRunCost(maxCostUsd).toFixed(2)}</p>
          </div>
        </div>

        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/50">
              <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Core Prompt Setup</p>
              <p className="text-xs text-muted-foreground">Set your primary prompt and keyword focus.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="main-ai-prompt">Main AI Prompt</Label>
              <Input
                id="main-ai-prompt"
                value={mainPrompt}
                onChange={(e) => setMainPrompt(e.target.value)}
                placeholder="e.g. best project management tools"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="main-keyword">Main Keyword (optional)</Label>
              <Input
                id="main-keyword"
                value={mainKeyword}
                onChange={(e) => setMainKeyword(e.target.value)}
                placeholder="e.g. project management software"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/50">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Targeting and Budget</p>
              <p className="text-xs text-muted-foreground">Control geo/language scope and run spend limits.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="language-code">Language Code</Label>
              <Input id="language-code" value={languageCode} onChange={(e) => setLanguageCode(e.target.value)} placeholder="en" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-code">Location Code</Label>
              <Input id="location-code" value={locationCode} onChange={(e) => setLocationCode(e.target.value)} placeholder="2840" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-cost-usd" className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                Max Cost Per Run (USD)
              </Label>
              <Input
                id="max-cost-usd"
                type="number"
                min={String(MIN_RUN_COST_USD)}
                max={String(ADMIN_MAX_COST_USD)}
                step="0.5"
                value={maxCostUsd}
                onChange={(e) => setMaxCostUsd(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Allowed range: ${MIN_RUN_COST_USD} - ${ADMIN_MAX_COST_USD}. Your selected value is always capped by admin policy.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Tracked Prompts</p>
              <p className="text-xs text-muted-foreground">One prompt per line for sync runs.</p>
            </div>
            <Badge variant="secondary">{prompts.length} active</Badge>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompts">Prompt List</Label>
            <Textarea
              id="prompts"
              value={promptsText}
              onChange={(e) => setPromptsText(e.target.value)}
              rows={8}
              className="resize-y"
              placeholder={"Why should I use a VPN at home?\nBest tools for SEO teams"}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-gradient-to-br from-slate-100 to-slate-50 border-slate-200/60">
                <Cpu className="h-3.5 w-3.5 text-slate-600" />
              </div>
              <p className="font-medium">Enabled Models</p>
            </div>
            <p className="text-sm text-muted-foreground">Choose which models should be included in each sync.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {MODEL_CARDS.map((modelCard) => {
              const isEnabledModel = modelCard.availability === "enabled";
              const checked = isEnabledModel ? models[modelCard.id as ProviderKey] : false;
              return (
                <div
                  key={modelCard.id}
                  className={`group rounded-xl border p-4 transition-all ${
                    isEnabledModel
                      ? "bg-card hover:-translate-y-0.5 hover:bg-accent/5 hover:shadow-sm border-border"
                      : "bg-muted/40 border-dashed border-muted-foreground/30 opacity-90"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background/80 transition-colors group-hover:bg-background">
                        <img
                          src={modelCard.logoSrc}
                          alt={modelCard.label}
                          className="h-5 w-5 object-contain"
                          loading="lazy"
                        />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">{modelCard.label}</Label>
                          {!isEnabledModel ? (
                            <Badge variant="secondary" className="text-[10px] tracking-wide">
                              Later Tier
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{modelCard.description}</p>
                      </div>
                    </div>

                    {isEnabledModel ? (
                      <Switch
                        id={`model-${modelCard.id}`}
                        checked={checked}
                        onCheckedChange={(next) => toggleModel(modelCard.id as ProviderKey, next)}
                      />
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground rounded-full border px-2 py-1">
                        <Lock className="h-3.5 w-3.5" />
                        Locked
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex items-center justify-between rounded-xl border bg-card p-4">
          <div>
            <p className="font-medium flex items-center gap-1.5">
              <CirclePause className="h-4 w-4 text-muted-foreground" />
              Pause Domain
            </p>
            <p className="text-sm text-muted-foreground">Pausing blocks manual and scheduled AI sync, but keeps historical data visible.</p>
          </div>
          <Switch id="pause-domain" checked={isPaused} onCheckedChange={setIsPaused} />
        </section>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="min-w-[220px]">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save AI Visibility Settings"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

