/*
Simple re-extract script.
Usage (PowerShell):
  $env:SUPABASE_URL="https://<project>.supabase.co";
  $env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>";
  node scripts/reextract_all.js

This script will fetch up to 1000 blog_posts and call the extract-post-keywords Edge Function for each.
Be careful with rate limits; the script pauses 500ms between calls.
*/

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env');
  process.exit(1);
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function run() {
  try {
    console.log('Fetching blog_posts (up to 1000)');
    const postsRes = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?select=id,title&limit=1000`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!postsRes.ok) {
      const t = await postsRes.text();
      throw new Error(`Failed fetching posts: ${postsRes.status} ${t}`);
    }

    const posts = await postsRes.json();
    console.log(`Found ${posts.length} posts, invoking extractor for each (this may take a while)`);

    for (const p of posts) {
      try {
        console.log(`Invoking extractor for post ${p.id}`);
        const invokeRes = await fetch(`${SUPABASE_URL}/functions/v1/extract-post-keywords`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ blog_post_id: p.id }),
        });

        if (!invokeRes.ok) {
          const text = await invokeRes.text();
          console.error(`Extractor invocation failed for ${p.id}: ${invokeRes.status} ${text}`);
        } else {
          const json = await invokeRes.json().catch(() => null);
          console.log(`Extractor response for ${p.id}:`, json);
        }
      } catch (err) {
        console.error('Error invoking extractor for', p.id, err.message || err);
      }

      await sleep(500); // small delay to avoid hammering
    }

    console.log('Done.');
  } catch (err) {
    console.error('Fatal error:', err.message || err);
    process.exit(1);
  }
}

run();
