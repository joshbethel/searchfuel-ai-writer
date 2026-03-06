import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY_MODE = process.argv.includes("--apply");
const BATCH_SIZE = 200;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function stripMarkdownCodeFence(text) {
  const trimmed = (text || "").trim();
  const match = trimmed.match(/^```(?:json|markdown)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function stripSurroundingQuotes(text) {
  const value = (text || "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function decodeCommonEscapes(text) {
  return (text || "")
    .replace(/\\\\n/g, "\n")
    .replace(/\\\\r/g, "\r")
    .replace(/\\\\t/g, "\t")
    .replace(/\\\\"/g, '"')
    .replace(/\\\\\\\\/g, "\\");
}

function looksJsonPayload(text) {
  const value = (text || "").trim();
  if (!value) return false;
  if (/^```json/i.test(value)) return true;
  return /^\{[\s\S]*"content"\s*:/i.test(value) || /^\{[\s\S]*"title"\s*:/i.test(value);
}

function extractJsonLikeField(raw, key, nextKeys) {
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

function normalizeAiPayload(rawContent) {
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

function shouldUpdateField(currentValue, newValue) {
  const current = (currentValue || "").trim();
  const next = (newValue || "").trim();
  return next.length > 0 && current !== next;
}

async function run() {
  console.log(`Mode: ${APPLY_MODE ? "APPLY" : "DRY-RUN"}`);

  let from = 0;
  let scanned = 0;
  let affected = 0;
  let updated = 0;
  const failedIds = [];

  while (true) {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("id, title, excerpt, content, meta_title, meta_description")
      .order("created_at", { ascending: true })
      .range(from, from + BATCH_SIZE - 1);

    if (error) {
      console.error("Failed to read blog_posts:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      scanned += 1;
      if (!looksJsonPayload(row.content)) continue;

      const normalized = normalizeAiPayload(row.content);
      if (!normalized || !normalized.content || looksJsonPayload(normalized.content)) continue;

      const payload = {};
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
      if (!APPLY_MODE) {
        console.log(`[DRY-RUN] would repair post ${row.id} (${Object.keys(payload).join(", ")})`);
        continue;
      }

      const { error: updateError } = await supabase
        .from("blog_posts")
        .update(payload)
        .eq("id", row.id);

      if (updateError) {
        failedIds.push(row.id);
        console.error(`Failed to update ${row.id}: ${updateError.message}`);
      } else {
        updated += 1;
        console.log(`Repaired post ${row.id}`);
      }
    }

    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  console.log("");
  console.log(`Scanned posts: ${scanned}`);
  console.log(`Detected affected posts: ${affected}`);
  if (APPLY_MODE) {
    console.log(`Updated posts: ${updated}`);
    console.log(`Failed updates: ${failedIds.length}`);
  }
}

run().catch((error) => {
  console.error("Repair script failed:", error);
  process.exit(1);
});
