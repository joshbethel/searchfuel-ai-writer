/**
 * Compare direct fetch vs r.jina.ai extraction for a target URL.
 * Saves results to files for comparison.
 *
 * Usage:
 *   node scripts/test-jina-fetch.js
 *   node scripts/test-jina-fetch.js https://trysearchfuel.com/
 */

import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_URL = "https://trysearchfuel.com/";
const targetUrl = process.argv[2] || DEFAULT_URL;
const jinaUrl = `https://r.jina.ai/${targetUrl}`;

// Sanitize URL for filename
function sanitizeFilename(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .slice(0, 100);
}

const baseFilename = sanitizeFilename(targetUrl);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function stripHtmlTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function preview(text, length = 500) {
  return (text || "").replace(/\s+/g, " ").trim().slice(0, length);
}

async function fetchWithTimeout(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      elapsedMs: Date.now() - startedAt,
      body,
    };
  } finally {
    clearTimeout(timer);
  }
}

function printSection(title) {
  console.log(`\n${"=".repeat(24)} ${title} ${"=".repeat(24)}`);
}

async function run() {
  console.log("Target URL:", targetUrl);
  console.log("Jina URL  :", jinaUrl);

  printSection("DIRECT FETCH");
  const direct = await fetchWithTimeout(targetUrl);
  const directPlain = stripHtmlTags(direct.body);
  console.log("Status      :", `${direct.status} ${direct.statusText}`);
  console.log("OK          :", direct.ok);
  console.log("Time (ms)   :", direct.elapsedMs);
  console.log("HTML length :", direct.body.length);
  console.log("Text length :", directPlain.length);
  console.log("Preview     :", preview(directPlain));

  printSection("R.JINA.AI FETCH");
  const jina = await fetchWithTimeout(jinaUrl);
  const jinaText = jina.body.trim();
  console.log("Status      :", `${jina.status} ${jina.statusText}`);
  console.log("OK          :", jina.ok);
  console.log("Time (ms)   :", jina.elapsedMs);
  console.log("Body length :", jinaText.length);
  console.log("Preview     :", preview(jinaText));

  printSection("COMPARISON");
  console.log("Direct text chars :", directPlain.length);
  console.log("Jina text chars   :", jinaText.length);
  console.log(
    "Result            :",
    jinaText.length > directPlain.length
      ? "r.jina.ai returned more readable content."
      : "Direct fetch content is similar or richer."
  );

  // Save results to files
  const outputDir = join(__dirname, '..', 'planning', 'improve-content-model', 'fetch-test-results');
  try {
    await writeFile(join(outputDir, `${baseFilename}_${timestamp}_direct-html.html`), direct.body, 'utf-8');
    await writeFile(join(outputDir, `${baseFilename}_${timestamp}_direct-text.txt`), directPlain, 'utf-8');
    await writeFile(join(outputDir, `${baseFilename}_${timestamp}_jina-extracted.txt`), jinaText, 'utf-8');
    
    printSection("FILES SAVED");
    console.log(`Direct HTML  : ${baseFilename}_${timestamp}_direct-html.html`);
    console.log(`Direct Text  : ${baseFilename}_${timestamp}_direct-text.txt`);
    console.log(`Jina Extracted: ${baseFilename}_${timestamp}_jina-extracted.txt`);
    console.log(`Output dir   : ${outputDir}`);
  } catch (error) {
    console.error("\nFailed to save files:", error.message);
    console.error("Results are still displayed above.");
  }
}

run().catch((error) => {
  console.error("\nScript failed:");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
