import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Provider = "chat_gpt" | "gemini" | "perplexity";

interface ProviderMetricAccumulator {
  promptsTotal: number;
  promptsWithBrandMention: number;
  ourMentions: number;
  totalMentionsAcrossTrackedBrands: number;
  positions: number[];
}

interface AdminPolicy {
  maxCostUsd: number;
  enabledModels: Record<Provider, boolean>;
  weeklyEnabled: boolean;
}

interface BlogSyncResult {
  blog_id: string;
  status: "completed" | "partial" | "stopped_budget" | "paused" | "skipped" | "error";
  run_id?: string;
  total_cost_usd?: number;
  error?: string;
}

const DATAFORSEO_LOGIN = Deno.env.get("DATAFORSEO_LOGIN");
const DATAFORSEO_PASSWORD = Deno.env.get("DATAFORSEO_PASSWORD");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const MIN_RUN_COST_USD = 1;
const DEFAULT_MAX_COST_USD = 1;
const ADMIN_MAX_COST_USD_FALLBACK = Math.max(
  MIN_RUN_COST_USD,
  Number(Deno.env.get("AI_VISIBILITY_ADMIN_MAX_COST_USD") || DEFAULT_MAX_COST_USD),
);

const DEFAULT_ENABLED_MODELS: Record<Provider, boolean> = {
  chat_gpt: true,
  gemini: true,
  perplexity: true,
};

const DEFAULT_MODEL_BY_PROVIDER: Record<Provider, string> = {
  chat_gpt: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash",
  perplexity: "sonar",
};

const DEFAULT_LANGUAGE_CODE = "en";
const DEFAULT_LOCATION_CODE = 2840;

function normalizeDomain(input?: string | null): string | null {
  if (!input) return null;
  try {
    const hasProtocol = input.startsWith("http://") || input.startsWith("https://");
    const parsed = new URL(hasProtocol ? input : `https://${input}`);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]?.toLowerCase() || null;
  }
}

function buildBrandTerms(blog: any): string[] {
  const terms = new Set<string>();
  if (blog?.company_name) terms.add(String(blog.company_name).toLowerCase().trim());
  if (blog?.title) terms.add(String(blog.title).toLowerCase().trim());
  const domains = [
    normalizeDomain(blog?.custom_domain),
    normalizeDomain(blog?.website_homepage),
    normalizeDomain(blog?.cms_site_url),
  ].filter(Boolean) as string[];
  for (const domain of domains) {
    terms.add(domain);
    const domainRoot = domain.split(".")[0];
    if (domainRoot && domainRoot.length > 2) terms.add(domainRoot);
  }
  return [...terms].filter(Boolean);
}

function extractCompetitorDomains(competitors: unknown): string[] {
  if (!Array.isArray(competitors)) return [];
  const domains = new Set<string>();
  for (const item of competitors) {
    if (!item || typeof item !== "object") continue;
    const domain = normalizeDomain((item as any).domain ?? (item as any).url ?? null);
    if (domain) domains.add(domain);
  }
  return [...domains];
}

function detectAny(text: string, terms: string[]): boolean {
  const lower = (text || "").toLowerCase();
  return terms.some((term) => term && lower.includes(term));
}

function countDetected(text: string, terms: string[]): number {
  const lower = (text || "").toLowerCase();
  return terms.reduce((acc, term) => (term && lower.includes(term) ? acc + 1 : acc), 0);
}

function clampRunCost(input: unknown, adminMaxCostUsd: number): number {
  const parsed = Number(input);
  if (Number.isNaN(parsed)) return DEFAULT_MAX_COST_USD;
  return Math.min(Math.max(parsed, MIN_RUN_COST_USD), adminMaxCostUsd);
}

function normalizePolicyEnabledModels(input: unknown): Record<Provider, boolean> {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    chat_gpt: raw.chat_gpt !== false,
    gemini: raw.gemini !== false,
    perplexity: raw.perplexity !== false,
  };
}

function normalizeLanguageCode(input: unknown): string {
  const normalized = String(input || DEFAULT_LANGUAGE_CODE).trim().toLowerCase();
  if (/^[a-z]{2}$/.test(normalized)) return normalized;
  return DEFAULT_LANGUAGE_CODE;
}

function normalizeLocationCode(input: unknown): number {
  const parsed = Number(input);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return DEFAULT_LOCATION_CODE;
}

async function getAdminPolicy(service: any): Promise<AdminPolicy> {
  const { data, error } = await service
    .from("ai_visibility_admin_policy")
    .select("max_cost_usd, enabled_models, weekly_sync_enabled")
    .eq("id", true)
    .maybeSingle();

  const maxCostUsd = Number(data?.max_cost_usd);
  const normalizedMaxCostUsd = Number.isNaN(maxCostUsd) ? ADMIN_MAX_COST_USD_FALLBACK : Math.max(MIN_RUN_COST_USD, maxCostUsd);

  if (error || !data) {
    return { maxCostUsd: normalizedMaxCostUsd, enabledModels: { ...DEFAULT_ENABLED_MODELS }, weeklyEnabled: true };
  }
  return {
    maxCostUsd: normalizedMaxCostUsd,
    enabledModels: normalizePolicyEnabledModels(data.enabled_models),
    weeklyEnabled: data.weekly_sync_enabled !== false,
  };
}

async function syncBlog(
  service: any,
  blog: any,
  adminPolicy: AdminPolicy,
  authString: string,
): Promise<BlogSyncResult> {
  const blogId = blog.id;

  // Track these outside the try so the catch can finalize the run row
  // if something throws after it has been created.
  let runId: string | null = null;
  let totalCostSoFar = 0;

  try {
    const { data: existingSettings } = await service
      .from("ai_visibility_settings")
      .select("*")
      .eq("blog_id", blogId)
      .maybeSingle();

    if (!existingSettings) {
      await service.from("ai_visibility_settings").upsert({
        blog_id: blogId,
        enabled_models: adminPolicy.enabledModels,
        language_code: DEFAULT_LANGUAGE_CODE,
        location_code: DEFAULT_LOCATION_CODE,
        max_cost_usd: Math.min(DEFAULT_MAX_COST_USD, adminPolicy.maxCostUsd),
      });
    }

    const { data: settings } = await service
      .from("ai_visibility_settings")
      .select("*")
      .eq("blog_id", blogId)
      .single();

    if (settings?.is_paused) {
      return { blog_id: blogId, status: "paused" };
    }

    const enabledModels = (settings?.enabled_models || DEFAULT_ENABLED_MODELS) as Record<string, boolean>;
    const providerCandidates: Provider[] = ["chat_gpt", "gemini", "perplexity"];
    const providers = providerCandidates.filter((p) => {
      if (adminPolicy.enabledModels[p] === false) return false;
      return enabledModels[p] !== false;
    });

    if (!providers.length) {
      return { blog_id: blogId, status: "skipped", error: "No enabled providers" };
    }

    const { data: promptsData } = await service
      .from("ai_visibility_prompts")
      .select("id, prompt_text, is_active, sort_order")
      .eq("blog_id", blogId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    let prompts = promptsData || [];

    if (!prompts.length && settings?.main_ai_prompt) {
      const { data: insertedPrompt } = await service
        .from("ai_visibility_prompts")
        .upsert(
          { blog_id: blogId, prompt_text: settings.main_ai_prompt, is_active: true, sort_order: 0 },
          { onConflict: "blog_id,prompt_text" },
        )
        .select("id, prompt_text, is_active, sort_order")
        .single();
      if (insertedPrompt) prompts = [insertedPrompt];
    }

    if (!prompts.length) {
      return { blog_id: blogId, status: "skipped", error: "No active prompts" };
    }

    const maxCostUsd = clampRunCost(settings?.max_cost_usd ?? DEFAULT_MAX_COST_USD, adminPolicy.maxCostUsd);
    const effectiveLanguageCode = normalizeLanguageCode(settings?.language_code);
    const effectiveLocationCode = normalizeLocationCode(settings?.location_code);

    const { data: run, error: runError } = await service
      .from("ai_visibility_runs")
      .insert({
        blog_id: blogId,
        run_type: "scheduled",
        status: "running",
        total_cost_usd: 0,
        effective_language_code: effectiveLanguageCode,
        effective_location_code: effectiveLocationCode,
      })
      .select("*")
      .single();

    if (runError || !run) {
      return { blog_id: blogId, status: "error", error: "Failed to create run record" };
    }

    runId = run.id; // now tracked so catch can finalize it

    const brandTerms = buildBrandTerms(blog);
    const competitorDomains = extractCompetitorDomains(blog.competitors);

    const metrics: Record<Provider, ProviderMetricAccumulator> = {
      chat_gpt: { promptsTotal: 0, promptsWithBrandMention: 0, ourMentions: 0, totalMentionsAcrossTrackedBrands: 0, positions: [] },
      gemini: { promptsTotal: 0, promptsWithBrandMention: 0, ourMentions: 0, totalMentionsAcrossTrackedBrands: 0, positions: [] },
      perplexity: { promptsTotal: 0, promptsWithBrandMention: 0, ourMentions: 0, totalMentionsAcrossTrackedBrands: 0, positions: [] },
    };

    let totalCost = 0;
    totalCostSoFar = totalCost; // keep outer ref in sync
    let errorsCount = 0;
    let stoppedByBudget = false;

    for (const prompt of prompts) {
      for (const provider of providers) {
        if (totalCost >= maxCostUsd) {
          stoppedByBudget = true;
          break;
        }

        const endpoint = `https://api.dataforseo.com/v3/ai_optimization/${provider}/llm_responses/live`;
        const payload = [
          {
            model_name: DEFAULT_MODEL_BY_PROVIDER[provider],
            user_prompt: prompt.prompt_text,
            language_code: effectiveLanguageCode,
            location_code: effectiveLocationCode,
          },
        ];

        let providerResponse: Response | null = null;
        let providerData: any = null;
        let responseCost = 0;

        try {
          providerResponse = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Basic ${authString}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          providerData = await providerResponse.json();
          responseCost = Number(providerData?.cost || 0);
          totalCost += responseCost;
          totalCostSoFar = totalCost;

          const task = providerData?.tasks?.[0];
          const result = task?.result?.[0];
          const sections = result?.items?.[0]?.sections || [];
          const text = sections
            .map((s: any) => (typeof s?.text === "string" ? s.text : ""))
            .join("\n")
            .trim();

          const hasBrandMention = detectAny(text, brandTerms);
          const competitorMentions = countDetected(text, competitorDomains);
          const ourMentions = hasBrandMention ? 1 : 0;
          const denominator = Math.max(ourMentions + competitorMentions, 1);
          const derivedPosition = hasBrandMention ? 1 : null;

          metrics[provider].promptsTotal += 1;
          metrics[provider].promptsWithBrandMention += hasBrandMention ? 1 : 0;
          metrics[provider].ourMentions += ourMentions;
          metrics[provider].totalMentionsAcrossTrackedBrands += denominator;
          if (derivedPosition) metrics[provider].positions.push(derivedPosition);

          await service.from("ai_visibility_results_raw").insert({
            run_id: run.id,
            blog_id: blogId,
            endpoint_name: `${provider}/llm_responses/live`,
            provider,
            task_id: task?.id ?? null,
            status_code: task?.status_code ?? providerData?.status_code ?? null,
            cost_usd: responseCost,
            payload_json: providerData,
          });

          await service.from("ai_visibility_mentions").insert({
            run_id: run.id,
            blog_id: blogId,
            prompt_id: prompt.id,
            provider,
            prompt_text: prompt.prompt_text,
            question: prompt.prompt_text,
            answer_excerpt: text?.slice(0, 2000) || null,
            position: derivedPosition,
            source_url: null,
            source_domain: null,
            detected_brand: hasBrandMention,
          });
        } catch (err) {
          errorsCount += 1;
          await service.from("ai_visibility_results_raw").insert({
            run_id: run.id,
            blog_id: blogId,
            endpoint_name: `${provider}/llm_responses/live`,
            provider,
            task_id: null,
            status_code: providerData?.status_code ?? null,
            cost_usd: responseCost,
            payload_json: {
              error: err instanceof Error ? err.message : "Unknown provider error",
              response_ok: providerResponse?.ok ?? false,
              provider_data: providerData,
            },
          });
        }
      }

      if (stoppedByBudget) break;
    }

    const metricRows = providers.map((provider) => {
      const m = metrics[provider];
      const avgPosition =
        m.positions.length > 0 ? m.positions.reduce((sum, p) => sum + p, 0) / m.positions.length : null;
      const visibilityScore = m.promptsTotal > 0 ? m.promptsWithBrandMention / m.promptsTotal : 0;
      const sov =
        m.totalMentionsAcrossTrackedBrands > 0 ? m.ourMentions / m.totalMentionsAcrossTrackedBrands : 0;

      return {
        run_id: run.id,
        blog_id: blogId,
        provider,
        prompts_total: m.promptsTotal,
        prompts_with_brand_mention: m.promptsWithBrandMention,
        our_mentions: m.ourMentions,
        total_mentions_across_tracked_brands: m.totalMentionsAcrossTrackedBrands,
        avg_position: avgPosition,
        visibility_score: visibilityScore,
        share_of_voice: sov,
      };
    });

    if (metricRows.length) {
      await service.from("ai_visibility_model_metrics").insert(metricRows);
    }

    const finalStatus = stoppedByBudget ? "stopped_budget" : errorsCount > 0 ? "partial" : "completed";

    await service
      .from("ai_visibility_runs")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        total_cost_usd: Number(totalCost.toFixed(2)),
        error_summary: errorsCount > 0 ? `${errorsCount} provider calls failed` : null,
      })
      .eq("id", run.id);

    // Stamp the last scheduled sync time on settings
    await service
      .from("ai_visibility_settings")
      .update({ last_scheduled_sync_at: new Date().toISOString() })
      .eq("blog_id", blogId);

    return {
      blog_id: blogId,
      run_id: run.id,
      status: finalStatus,
      total_cost_usd: Number(totalCost.toFixed(2)),
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[ai-visibility-scheduled-sync] blog ${blogId} error:`, err);

    // If a run row was created before the exception, mark it failed so it
    // doesn't stay stuck in "running" indefinitely.
    if (runId) {
      try {
        await service
          .from("ai_visibility_runs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            total_cost_usd: Number(totalCostSoFar.toFixed(2)),
            error_summary: errMsg,
          })
          .eq("id", runId);
      } catch (finalizeErr) {
        console.error(`[ai-visibility-scheduled-sync] blog ${blogId} failed to finalize run ${runId}:`, finalizeErr);
      }
    }

    return {
      blog_id: blogId,
      run_id: runId ?? undefined,
      status: "error",
      error: errMsg,
    };
  }
}

serve(async (_req) => {
  if (_req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[ai-visibility-scheduled-sync] Missing required environment variables");
    return new Response(
      JSON.stringify({ error: "Server misconfigured: missing environment variables" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log("[ai-visibility-scheduled-sync] Starting weekly scheduled run");

  try {
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const adminPolicy = await getAdminPolicy(service);

    if (!adminPolicy.weeklyEnabled) {
      console.log("[ai-visibility-scheduled-sync] Weekly sync is globally disabled by admin — skipping run");
      return new Response(
        JSON.stringify({ success: true, status: "globally_paused", message: "Weekly sync is disabled globally by admin." }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const authString = btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);

    // Find all blogs that have ai_visibility_settings, are not paused,
    // and have weekly sync enabled (weekly_sync_enabled defaults to true).
    const { data: eligibleSettings, error: settingsError } = await service
      .from("ai_visibility_settings")
      .select("blog_id")
      .eq("is_paused", false)
      .eq("weekly_sync_enabled", true);

    if (settingsError) {
      console.error("[ai-visibility-scheduled-sync] Failed to fetch eligible settings:", settingsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch eligible sites" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const blogIds = (eligibleSettings || []).map((s: any) => s.blog_id);

    if (!blogIds.length) {
      console.log("[ai-visibility-scheduled-sync] No eligible sites to sync");
      return new Response(
        JSON.stringify({ success: true, message: "No eligible sites to sync", processed: 0, results: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Load blog data for all eligible blogs
    const { data: blogs, error: blogsError } = await service
      .from("blogs")
      .select("id, user_id, title, company_name, custom_domain, website_homepage, cms_site_url, competitors")
      .in("id", blogIds);

    if (blogsError || !blogs) {
      console.error("[ai-visibility-scheduled-sync] Failed to fetch blogs:", blogsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch blog data" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[ai-visibility-scheduled-sync] Processing ${blogs.length} site(s)`);

    const results: BlogSyncResult[] = [];
    for (const blog of blogs) {
      console.log(`[ai-visibility-scheduled-sync] Syncing blog: ${blog.id} (${blog.title || blog.id})`);
      const result = await syncBlog(service, blog, adminPolicy, authString);
      results.push(result);
      console.log(`[ai-visibility-scheduled-sync] Blog ${blog.id} result: ${result.status}`);
    }

    const summary = {
      total: results.length,
      completed: results.filter((r) => r.status === "completed").length,
      partial: results.filter((r) => r.status === "partial").length,
      stopped_budget: results.filter((r) => r.status === "stopped_budget").length,
      paused: results.filter((r) => r.status === "paused").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      total_cost_usd: Number(
        results.reduce((sum, r) => sum + (r.total_cost_usd || 0), 0).toFixed(2),
      ),
    };

    console.log("[ai-visibility-scheduled-sync] Run complete:", summary);

    return new Response(
      JSON.stringify({ success: true, summary, results }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ai-visibility-scheduled-sync] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
