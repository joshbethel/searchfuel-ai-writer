// supabase/functions/migrate-credentials/index.ts
// Admin-only function to migrate plaintext CMS credentials to encrypted format

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encryptCredentials, isEncrypted } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Admin token gate (no UI exposure, simple header-based shared secret)
    const providedToken = req.headers.get("x-admin-token") ?? req.headers.get("X-Admin-Token");
    const expectedToken = Deno.env.get("MIGRATION_ADMIN_TOKEN");

    if (!expectedToken) {
      return new Response(
        JSON.stringify({ error: "MIGRATION_ADMIN_TOKEN not configured on the backend" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!providedToken || providedToken !== expectedToken) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service role client for admin-wide migration
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all blogs with any credentials present
    const { data: blogs, error } = await supabase
      .from('blogs')
      .select('id, cms_credentials, cms_platform')
      .not('cms_credentials', 'is', null);

    if (error) {
      console.error('Error fetching blogs:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch blogs', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!blogs || blogs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, migrated: 0, skipped: 0, errors: 0, total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const blog of blogs as any[]) {
      try {
        const credentials = blog.cms_credentials;

        // Already encrypted and stored as string -> skip
        if (typeof credentials === 'string' && isEncrypted(credentials)) {
          skipped++;
          continue;
        }

        // Encrypt credentials (object or legacy string JSON)
        let source: any = credentials;
        if (typeof credentials === 'string') {
          try {
            source = JSON.parse(credentials);
          } catch {
            // If not JSON, still pass through to encrypt (it will stringify)
            source = credentials;
          }
        }

        const encrypted = await encryptCredentials(source);

        const { error: updateError } = await supabase
          .from('blogs')
          .update({ cms_credentials: encrypted })
          .eq('id', blog.id);

        if (updateError) {
          console.error(`Error updating blog ${blog.id}:`, updateError);
          errors++;
        } else {
          migrated++;
        }
      } catch (e) {
        console.error(`Error processing blog ${blog.id}:`, e);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, migrated, skipped, errors, total: blogs.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Migration error:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Migration failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
