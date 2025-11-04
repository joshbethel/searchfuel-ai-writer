# Keyword Extraction & Recommendation Pipeline

This document describes the pipeline added to the project to extract keywords from generated or imported content and produce recommended article topics.

## Components added

- Supabase Edge Function: `extract-post-keywords`
  - Path: `supabase/functions/extract-post-keywords/index.ts`
  - Accepts: `{ blog_post_id?, article_id?, title?, content? }`
  - Behavior:
    - If `blog_post_id` is provided, will fetch the `blog_posts` record and extract keywords from its title/content and update `blog_posts.extracted_keywords` and `blog_posts.recommended_topics`.
    - If `article_id` is provided, it will update the `articles` table's `extracted_keywords` and `recommended_topics` fields.
    - If only `title` and `content` are provided, the function returns `extracted` and `recommended` results in the response.
    - The extractor is rule-based (unigrams + bigrams, stopword removal, title boost, difficulty-based boost using the `keywords` table when available).

- Database migrations:
  - `supabase/migrations/20251103_add_extracted_keywords_and_recommended_topics.sql` (adds columns to `blog_posts`)
  - `supabase/migrations/20251103_add_keywords_to_articles.sql` (adds columns to `articles`)

- Frontend component: `src/components/KeywordPanel.tsx`
  - Shows extracted keywords and recommended topics for a given `blog_post` or `article`.
  - Provides "Create Draft" action to create a new draft article from a recommended topic.

- Integration points:
  - `supabase/functions/generate-blog-post/index.ts` now invokes `extract-post-keywords` after creating a blog post.
  - `supabase/functions/generate-article/index.ts` now invokes `extract-post-keywords` after saving an article.
  - `src/pages/ArticleDetail.tsx` shows `KeywordPanel` for individual articles.
  - `src/pages/Articles.tsx` shows `KeywordPanel` for blog posts in lists.

- Local demo script: `scripts/extractor_demo.js` to run the extraction logic locally with Node.js for quick iteration.

## Env vars required for functions

The extraction function itself does not require external API keys, but to run it in context with full enrichment you should set:

- `SUPABASE_URL` (project URL)
- `SUPABASE_SERVICE_ROLE_KEY` (service role key to allow updates)

Other related functions require additional keys:

- `LOVABLE_API_KEY` — AI generation
- `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` — DataForSEO metrics

## How to deploy and test

1. Apply migrations to your Supabase database (or run locally):

   Use your usual migration tool (pg cli or Supabase CLI) to run the SQL files in `supabase/migrations/`.

2. Deploy the new functions to Supabase (Deno runtime):

   - Deploy `extract-post-keywords` and ensure the function's environment has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   - The generate functions will invoke the extractor automatically when creating content.

3. Create a post via the UI (or call the generator). After creation, the extractor will run and update the corresponding record with `extracted_keywords` and `recommended_topics`.

4. Use the `KeywordPanel` in the app to view keywords and suggestions.

## Troubleshooting

- If you see `Failed to fetch` or `ERR_QUIC_PROTOCOL_ERROR` in the browser console, try:
  - Using a different browser (Firefox)
  - Disabling QUIC in Chrome (`chrome://flags/#enable-quic`) or disable VPN/ad-blockers
  - Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set in your Vite environment and printed in browser console (client warns when missing)

- If the extractor doesn't update records:
  - Check function logs in Supabase dashboard for errors
  - Confirm function has `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` configured

## Next improvements (recommended)

- Phase 2: Improve scoring using site-level IDF (compute document frequencies across the blog's posts) and add recency/popularity boosts.
- Phase 3: Add embeddings (OpenAI or local models) and pgvector; use semantic similarity for richer topic recommendations.
- Add automated tests and evaluation dataset to measure precision@k for keywords and topics.

