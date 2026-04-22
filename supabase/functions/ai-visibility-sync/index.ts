import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

type Provider = "chat_gpt" | "gemini" | "perplexity";

interface SyncRequest {
  blog_id: string;
  prompt_ids?: string[];
  providers?: Provider[];
  max_cost_usd?: number;
}

interface ProviderMetricAccumulator {
  promptsTotal: number;
  promptsWithBrandMention: number;
  ourMentions: number;
  totalMentionsAcrossTrackedBrands: number;
  positions: number[];
}

const DATAFORSEO_LOGIN = Deno.env.get("DATAFORSEO_LOGIN");
const DATAFORSEO_PASSWORD = Deno.env.get("DATAFORSEO_PASSWORD");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const MIN_RUN_COST_USD = 1;
const DEFAULT_MAX_COST_USD = 5;
const ADMIN_MAX_COST_USD = Math.max(
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

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

function clampRunCost(input: unknown): number {
  const parsed = Number(input);
  if (Number.isNaN(parsed)) return DEFAULT_MAX_COST_USD;
  return Math.min(Math.max(parsed, MIN_RUN_COST_USD), ADMIN_MAX_COST_USD);
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return jsonResponse({ error: "Server misconfigured: missing environment variables" }, 500, corsHeaders);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid authorization header" }, 401, corsHeaders);
    }

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: authData, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !authData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    }
    const userId = authData.user.id;

    let body: SyncRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
    }

    const blogId = body?.blog_id;
    if (!blogId) {
      return jsonResponse({ error: "blog_id is required" }, 400, corsHeaders);
    }

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: blog, error: blogError } = await service
      .from("blogs")
      .select("id, user_id, title, company_name, custom_domain, website_homepage, cms_site_url, competitors")
      .eq("id", blogId)
      .single();

    if (blogError || !blog) {
      return jsonResponse({ error: "Blog not found" }, 404, corsHeaders);
    }
    if (blog.user_id !== userId) {
      return jsonResponse({ error: "Forbidden for this blog" }, 403, corsHeaders);
    }

    const { data: existingSettings } = await service
      .from("ai_visibility_settings")
      .select("*")
      .eq("blog_id", blogId)
      .maybeSingle();

    if (!existingSettings) {
      await service.from("ai_visibility_settings").upsert({
        blog_id: blogId,
        enabled_models: DEFAULT_ENABLED_MODELS,
        language_code: "en",
        location_code: 2840,
        max_cost_usd: Math.min(DEFAULT_MAX_COST_USD, ADMIN_MAX_COST_USD),
      });
    }

    const { data: settings } = await service
      .from("ai_visibility_settings")
      .select("*")
      .eq("blog_id", blogId)
      .single();

    if (settings?.is_paused) {
      return jsonResponse(
        {
          success: true,
          status: "paused",
          message: "AI visibility sync is paused for this site.",
        },
        200,
        corsHeaders,
      );
    }

    const requestedProviders = Array.isArray(body.providers) ? body.providers : null;
    const enabledModels = (settings?.enabled_models || DEFAULT_ENABLED_MODELS) as Record<string, boolean>;
    const providerCandidates: Provider[] = ["chat_gpt", "gemini", "perplexity"];
    const providers = providerCandidates.filter((p) => {
      if (requestedProviders && !requestedProviders.includes(p)) return false;
      return enabledModels[p] !== false;
    });

    if (!providers.length) {
      return jsonResponse({ error: "No enabled providers to run." }, 400, corsHeaders);
    }

    let promptsQuery = service
      .from("ai_visibility_prompts")
      .select("id, prompt_text, is_active, sort_order")
      .eq("blog_id", blogId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (body.prompt_ids?.length) {
      promptsQuery = promptsQuery.in("id", body.prompt_ids);
    }

    const { data: promptsData } = await promptsQuery;
    let prompts = promptsData || [];

    if (!prompts.length && settings?.main_ai_prompt) {
      const { data: insertedPrompt } = await service
        .from("ai_visibility_prompts")
        .upsert(
          {
            blog_id: blogId,
            prompt_text: settings.main_ai_prompt,
            is_active: true,
            sort_order: 0,
          },
          { onConflict: "blog_id,prompt_text" },
        )
        .select("id, prompt_text, is_active, sort_order")
        .single();

      if (insertedPrompt) {
        prompts = [insertedPrompt];
      }
    }

    if (!prompts.length) {
      return jsonResponse({ error: "No active prompts found. Add prompts first." }, 400, corsHeaders);
    }

    const requestedMaxCost = body.max_cost_usd ?? settings?.max_cost_usd ?? DEFAULT_MAX_COST_USD;
    const maxCostUsd = clampRunCost(requestedMaxCost);
    const runType = "manual";

    const { data: run, error: runError } = await service
      .from("ai_visibility_runs")
      .insert({
        blog_id: blogId,
        run_type: runType,
        status: "running",
        total_cost_usd: 0,
      })
      .select("*")
      .single();

    if (runError || !run) {
      return jsonResponse({ error: "Failed to create sync run" }, 500, corsHeaders);
    }

    const brandTerms = buildBrandTerms(blog);
    const competitorDomains = extractCompetitorDomains(blog.competitors);

    const metrics: Record<Provider, ProviderMetricAccumulator> = {
      chat_gpt: { promptsTotal: 0, promptsWithBrandMention: 0, ourMentions: 0, totalMentionsAcrossTrackedBrands: 0, positions: [] },
      gemini: { promptsTotal: 0, promptsWithBrandMention: 0, ourMentions: 0, totalMentionsAcrossTrackedBrands: 0, positions: [] },
      perplexity: { promptsTotal: 0, promptsWithBrandMention: 0, ourMentions: 0, totalMentionsAcrossTrackedBrands: 0, positions: [] },
    };

    let totalCost = 0;
    let errorsCount = 0;
    let stoppedByBudget = false;

    const authString = btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);

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
          const derivedPosition = hasBrandMention ? 1 : null; // MVP heuristic

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
        } catch (error) {
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
              error: error instanceof Error ? error.message : "Unknown provider error",
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
        m.totalMentionsAcrossTrackedBrands > 0
          ? m.ourMentions / m.totalMentionsAcrossTrackedBrands
          : 0;

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

    const finalStatus = stoppedByBudget
      ? "stopped_budget"
      : errorsCount > 0
      ? "partial"
      : "completed";

    await service
      .from("ai_visibility_runs")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        total_cost_usd: Number(totalCost.toFixed(2)),
        error_summary: errorsCount > 0 ? `${errorsCount} provider calls failed` : null,
      })
      .eq("id", run.id);

    return jsonResponse(
      {
        success: true,
        run_id: run.id,
        status: finalStatus,
        total_cost_usd: Number(totalCost.toFixed(2)),
        max_cost_usd: maxCostUsd,
        admin_max_cost_usd: ADMIN_MAX_COST_USD,
        stopped_by_budget: stoppedByBudget,
        providers,
        prompts_processed: prompts.length,
        errors_count: errorsCount,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    console.error("ai-visibility-sync error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      500,
      corsHeaders,
    );
  }
});

