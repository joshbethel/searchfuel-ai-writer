import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DollarSign, Info, Loader2, ShieldCheck, Sparkles } from "lucide-react";

type ProviderKey = "chat_gpt" | "gemini" | "perplexity";

const MIN_RUN_COST_USD = 1;
const DEFAULT_MAX_COST_USD = 1;
const DEFAULT_ADMIN_ENABLED_MODELS: Record<ProviderKey, boolean> = {
  chat_gpt: true,
  gemini: true,
  perplexity: true,
};

export default function AiVisibilityAdminControls() {
  const [aiVisibilityMaxCostUsd, setAiVisibilityMaxCostUsd] = useState<string>(String(DEFAULT_MAX_COST_USD));
  const [aiVisibilityEnabledModels, setAiVisibilityEnabledModels] = useState<Record<ProviderKey, boolean>>(DEFAULT_ADMIN_ENABLED_MODELS);
  const [loadingAiVisibilityPolicy, setLoadingAiVisibilityPolicy] = useState(true);
  const [savingAiVisibilityPolicy, setSavingAiVisibilityPolicy] = useState(false);
  const enabledModelCount = Object.values(aiVisibilityEnabledModels).filter(Boolean).length;

  useEffect(() => {
    loadAiVisibilityPolicy();
  }, []);

  const loadAiVisibilityPolicy = async () => {
    setLoadingAiVisibilityPolicy(true);
    try {
      const sb = supabase;
      const { data, error } = await sb
        .from("ai_visibility_admin_policy")
        .select("max_cost_usd, enabled_models")
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
    } catch (error: unknown) {
      console.error("Error loading AI visibility policy:", error);
      const message = error instanceof Error ? error.message : "Failed to load AI visibility budget policy";
      toast.error(message);
      setAiVisibilityMaxCostUsd(String(DEFAULT_MAX_COST_USD));
      setAiVisibilityEnabledModels(DEFAULT_ADMIN_ENABLED_MODELS);
    } finally {
      setLoadingAiVisibilityPolicy(false);
    }
  };

  const toggleAiVisibilityModel = (provider: ProviderKey, enabled: boolean) => {
    setAiVisibilityEnabledModels((prev) => ({ ...prev, [provider]: enabled }));
  };

  const saveAiVisibilityPolicy = async () => {
    const parsedValue = Number(aiVisibilityMaxCostUsd);
    if (Number.isNaN(parsedValue) || parsedValue < MIN_RUN_COST_USD) {
      toast.error(`Max cost cap must be at least ${MIN_RUN_COST_USD} USD`);
      return;
    }

    setSavingAiVisibilityPolicy(true);
    try {
      const sb = supabase;
      const { data: authData, error: authError } = await sb.auth.getUser();
      if (authError || !authData?.user?.id) {
        throw new Error("Could not verify current admin user");
      }

      const normalizedValue = Number(parsedValue.toFixed(2));
      const { data: existingPolicy, error: existingPolicyError } = await sb
        .from("ai_visibility_admin_policy")
        .select("max_cost_usd, enabled_models")
        .eq("id", true)
        .maybeSingle();
      if (existingPolicyError) throw existingPolicyError;
      const previousValue = Number(existingPolicy?.max_cost_usd ?? DEFAULT_MAX_COST_USD);
      const previousRawEnabledModels =
        existingPolicy?.enabled_models && typeof existingPolicy.enabled_models === "object"
          ? (existingPolicy.enabled_models as Record<string, unknown>)
          : {};
      const previousModels = {
        chat_gpt: previousRawEnabledModels.chat_gpt !== false,
        gemini: previousRawEnabledModels.gemini !== false,
        perplexity: previousRawEnabledModels.perplexity !== false,
      };

      const { error } = await sb
        .from("ai_visibility_admin_policy")
        .upsert(
          {
            id: true,
            max_cost_usd: normalizedValue,
            enabled_models: aiVisibilityEnabledModels,
            updated_by: authData.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );

      if (error) throw error;

      const budgetChanged = Number(previousValue.toFixed(2)) !== normalizedValue;
      const modelsChanged = JSON.stringify(previousModels) !== JSON.stringify(aiVisibilityEnabledModels);
      const auditRows = [];

      if (budgetChanged) {
        auditRows.push({
          admin_user_id: authData.user.id,
          action_type: "update_ai_visibility_budget_policy",
          target_user_id: authData.user.id,
          details: {
            previous_max_cost_usd: Number(previousValue.toFixed(2)),
            new_max_cost_usd: normalizedValue,
          },
        });
      }

      if (modelsChanged) {
        auditRows.push({
          admin_user_id: authData.user.id,
          action_type: "update_ai_visibility_model_policy",
          target_user_id: authData.user.id,
          details: {
            previous_enabled_models: previousModels,
            new_enabled_models: aiVisibilityEnabledModels,
          },
        });
      }

      if (auditRows.length > 0) {
        const { error: auditError } = await sb.from("admin_actions").insert(auditRows);
        if (auditError) {
          console.error("Failed to write audit log for AI visibility policy update:", auditError);
        }
      }

      setAiVisibilityMaxCostUsd(String(normalizedValue));
      toast.success("AI visibility policy updated");
    } catch (error: unknown) {
      console.error("Error saving AI visibility policy:", error);
      const message = error instanceof Error ? error.message : "Failed to save AI visibility budget policy";
      toast.error(message);
    } finally {
      setSavingAiVisibilityPolicy(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="px-2.5 py-1">Global Policy</Badge>
          <Badge variant="outline" className="px-2.5 py-1">
            {enabledModelCount}/3 models enabled
          </Badge>
          <Badge variant="outline" className="px-2.5 py-1">
            Cap: ${Number(aiVisibilityMaxCostUsd || DEFAULT_MAX_COST_USD).toFixed(2)}
          </Badge>
        </div>
        <h1 className="text-3xl font-bold">AI Visibility Admin Controls</h1>
        <p className="text-muted-foreground max-w-2xl">
          Global policies applied across all sites for AI visibility runs.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                disabled={loadingAiVisibilityPolicy || savingAiVisibilityPolicy}
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
            <div className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-background/80">
                  <img src="/images/openai.svg" alt="ChatGPT" className="h-4 w-4 object-contain" loading="lazy" />
                </div>
                <div>
                  <p className="text-sm font-medium">ChatGPT</p>
                  <p className="text-xs text-muted-foreground">OpenAI model tracking</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={aiVisibilityEnabledModels.chat_gpt ? "secondary" : "outline"} className="text-[10px]">
                  {aiVisibilityEnabledModels.chat_gpt ? "Enabled" : "Disabled"}
                </Badge>
                <Switch
                  checked={aiVisibilityEnabledModels.chat_gpt}
                  onCheckedChange={(checked) => toggleAiVisibilityModel("chat_gpt", checked)}
                  disabled={loadingAiVisibilityPolicy || savingAiVisibilityPolicy}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-background/80">
                  <img src="/images/perplexity-color.svg" alt="Perplexity" className="h-4 w-4 object-contain" loading="lazy" />
                </div>
                <div>
                  <p className="text-sm font-medium">Perplexity</p>
                  <p className="text-xs text-muted-foreground">Perplexity answer and sources</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={aiVisibilityEnabledModels.perplexity ? "secondary" : "outline"} className="text-[10px]">
                  {aiVisibilityEnabledModels.perplexity ? "Enabled" : "Disabled"}
                </Badge>
                <Switch
                  checked={aiVisibilityEnabledModels.perplexity}
                  onCheckedChange={(checked) => toggleAiVisibilityModel("perplexity", checked)}
                  disabled={loadingAiVisibilityPolicy || savingAiVisibilityPolicy}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-background/80">
                  <img src="/images/gemini-color.svg" alt="Gemini" className="h-4 w-4 object-contain" loading="lazy" />
                </div>
                <div>
                  <p className="text-sm font-medium">Gemini</p>
                  <p className="text-xs text-muted-foreground">Google Gemini responses</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={aiVisibilityEnabledModels.gemini ? "secondary" : "outline"} className="text-[10px]">
                  {aiVisibilityEnabledModels.gemini ? "Enabled" : "Disabled"}
                </Badge>
                <Switch
                  checked={aiVisibilityEnabledModels.gemini}
                  onCheckedChange={(checked) => toggleAiVisibilityModel("gemini", checked)}
                  disabled={loadingAiVisibilityPolicy || savingAiVisibilityPolicy}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <Button
          variant="outline"
          onClick={loadAiVisibilityPolicy}
          disabled={loadingAiVisibilityPolicy || savingAiVisibilityPolicy}
          className="sm:min-w-[140px]"
        >
          {loadingAiVisibilityPolicy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reload Policy"}
        </Button>
        <Button
          onClick={saveAiVisibilityPolicy}
          disabled={loadingAiVisibilityPolicy || savingAiVisibilityPolicy}
          className="sm:min-w-[210px]"
        >
          {savingAiVisibilityPolicy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save AI Visibility Policy
        </Button>
      </div>
    </div>
  );
}
