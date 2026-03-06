import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface RepairRequest {
  dry_run?: boolean;
  post_id?: string;
  blog_id?: string;
  scan_limit?: number;
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = (text || "").trim();
  const match = trimmed.match(/^```(?:json|markdown)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function stripSurroundingQuotes(text: string): string {
  const value = (text || "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function decodeCommonEscapes(text: string): string {
  return (text || "")
    .replace(/\\\\n/g, "\n")
    .replace(/\\\\r/g, "\r")
    .replace(/\\\\t/g, "\t")
    .replace(/\\\\"/g, '"')
    .replace(/\\\\\\\\/g, "\\");
}

function looksJsonPayload(text: string): boolean {
  const value = (text || "").trim();
  if (!value) return false;
  if (/^```json/i.test(value)) return true;
  return /^\{[\s\S]*"content"\s*:/i.test(value) || /^\{[\s\S]*"title"\s*:/i.test(value);
}

function extractJsonLikeField(raw: string, key: string, nextKeys: string[]): string {
  const keyPattern = new RegExp(`"${key}"\\s*:\\s*"`, "i");
  const startMatch = keyPattern.exec(raw);
  if (!startMatch || startMatch.index === undefined) return "";

  const start = startMatch.index + startMatch[0].length;
  let end = -1;

  for (const nextKey of nextKeys) {
    const delimiterPattern = new RegExp(`",\\s*\\n?\\s*"${nextKey}"\\s*:`, "i");
    const tail = raw.slice(start);
    const nextMatch = delimiterPattern.exec(tail);
    if (nextMatch && nextMatch.index !== undefined) {
      const candidate = start + nextMatch.index;
      if (end === -1 || candidate < end) end = candidate;
    }
  }

  if (end === -1) {
    const objectEnd = raw.lastIndexOf('"\n}');
    if (objectEnd > start) end = objectEnd;
  }

  const slice = end === -1 ? raw.slice(start) : raw.slice(start, end);
  return decodeCommonEscapes(stripSurroundingQuotes(slice.trim()));
}

function normalizeAiPayload(rawContent: string): {
  title: string;
  excerpt: string;
  content: string;
  meta_title: string;
  meta_description: string;
} | null {
  const cleaned = stripMarkdownCodeFence(rawContent);

  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: stripSurroundingQuotes(parsed?.title || ""),
      excerpt: stripSurroundingQuotes(parsed?.excerpt || ""),
      content: stripMarkdownCodeFence(parsed?.content || ""),
      meta_title: stripSurroundingQuotes(parsed?.meta_title || ""),
      meta_description: stripSurroundingQuotes(parsed?.meta_description || ""),
    };
  } catch {
    const looksJsonLike = /^\s*\{[\s\S]*"title"\s*:/i.test(cleaned) || /"content"\s*:/i.test(cleaned);
    if (!looksJsonLike) return null;

    const title = extractJsonLikeField(cleaned, "title", ["excerpt", "content", "meta_title", "meta_description"]);
    const excerpt = extractJsonLikeField(cleaned, "excerpt", ["content", "meta_title", "meta_description"]);
    const content = extractJsonLikeField(cleaned, "content", ["meta_title", "meta_description"]);
    const metaTitle = extractJsonLikeField(cleaned, "meta_title", ["meta_description"]);
    const metaDescription = extractJsonLikeField(cleaned, "meta_description", []);

    if (!title && !excerpt && !content && !metaTitle && !metaDescription) return null;
    return {
      title,
      excerpt,
      content,
      meta_title: metaTitle,
      meta_description: metaDescription,
    };
  }
}

function shouldUpdateField(currentValue: string | null, newValue: string): boolean {
  const current = (currentValue || "").trim();
  const next = (newValue || "").trim();
  return next.length > 0 && current !== next;
}

async function isAdminUser(supabaseService: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data, error } = await supabaseService
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .single();

  if (error || !data) return false;
  return true;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"), "POST, OPTIONS");
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY");
    }

    const authHeader = req.headers.get("Authorization");
    const internalCallHeader = req.headers.get("x-internal-edge-call");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const isInternalServiceCall =
      internalCallHeader === "true" && token === SUPABASE_SERVICE_ROLE_KEY;

    const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!isInternalServiceCall) {
      const { data: authData, error: authError } = await supabaseAnon.auth.getUser(token);
      if (authError || !authData.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isAdmin = await isAdminUser(supabaseService, authData.user.id);
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    let body: RepairRequest = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const dryRun = body.dry_run !== false;
    const postId = body.post_id?.trim();
    const blogId = body.blog_id?.trim();
    const requestedScanLimit = Number(body.scan_limit || 1000);
    const scanLimit = Number.isFinite(requestedScanLimit)
      ? Math.min(Math.max(requestedScanLimit, 1), 5000)
      : 1000;
    const BATCH_SIZE = 200;

    let scanned = 0;
    let affected = 0;
    let updated = 0;
    const failed: Array<{ id: string; reason: string }> = [];
    const touchedPostIds: string[] = [];
    let offset = 0;

    while (scanned < scanLimit) {
      let query = supabaseService
        .from("blog_posts")
        .select("id, blog_id, title, excerpt, content, meta_title, meta_description, created_at")
        .order("created_at", { ascending: true });

      if (postId) query = query.eq("id", postId);
      if (blogId) query = query.eq("blog_id", blogId);

      const remaining = scanLimit - scanned;
      const batchSize = Math.min(BATCH_SIZE, remaining);
      const { data: rows, error: fetchError } = await query.range(offset, offset + batchSize - 1);

      if (fetchError) {
        throw new Error(`Failed to fetch blog_posts: ${fetchError.message}`);
      }
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        scanned += 1;
        if (!looksJsonPayload(row.content || "")) continue;

        const normalized = normalizeAiPayload(row.content || "");
        if (!normalized || !normalized.content || looksJsonPayload(normalized.content)) continue;

        const payload: Record<string, string> = {};
        if (shouldUpdateField(row.content, normalized.content)) payload.content = normalized.content;
        if (shouldUpdateField(row.title, normalized.title)) payload.title = normalized.title;
        if (shouldUpdateField(row.excerpt, normalized.excerpt)) payload.excerpt = normalized.excerpt;
        if (shouldUpdateField(row.meta_title, normalized.meta_title || normalized.title)) {
          payload.meta_title = normalized.meta_title || normalized.title;
        }
        if (shouldUpdateField(row.meta_description, normalized.meta_description || normalized.excerpt)) {
          payload.meta_description = normalized.meta_description || normalized.excerpt;
        }

        if (Object.keys(payload).length === 0) continue;

        affected += 1;
        touchedPostIds.push(row.id);

        if (dryRun) continue;

        const { error: updateError } = await supabaseService
          .from("blog_posts")
          .update(payload)
          .eq("id", row.id);

        if (updateError) {
          failed.push({ id: row.id, reason: updateError.message });
        } else {
          updated += 1;
        }
      }

      if (rows.length < batchSize || postId) break;
      offset += batchSize;
    }

    console.log(`[repair-blog-post-content][${requestId}] done`, {
      dryRun,
      postId,
      blogId,
      scanLimit,
      scanned,
      affected,
      updated,
      failed: failed.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        mode: dryRun ? "dry_run" : "apply",
        filters: { post_id: postId || null, blog_id: blogId || null, scan_limit: scanLimit },
        summary: {
          scanned,
          affected,
          updated,
          failed: failed.length,
        },
        touched_post_ids: touchedPostIds,
        failures: failed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[repair-blog-post-content][${requestId}] error`, message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
