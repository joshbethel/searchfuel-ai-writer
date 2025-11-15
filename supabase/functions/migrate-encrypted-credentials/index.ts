import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encryptCredentials, isEncrypted } from "../_shared/encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // CRITICAL SECURITY: Authenticate user first
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ENCRYPTION_KEY = Deno.env.get('CMS_CREDENTIALS_ENCRYPTION_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing environment variables' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ENCRYPTION_KEY) {
      return new Response(
        JSON.stringify({ error: 'CMS_CREDENTIALS_ENCRYPTION_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;
    console.log(`Authenticated user: ${userId} - Starting credential migration`);

    // Use service role client to bypass RLS
    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('🔄 Starting credential migration...');
    console.log(`   Encryption Key: ${ENCRYPTION_KEY.substring(0, 10)}...`);
    
    // Fetch all blogs with credentials for this user
    const { data: blogs, error } = await supabaseService
      .from('blogs')
      .select('id, cms_credentials, cms_platform')
      .eq('user_id', userId)
      .not('cms_credentials', 'is', null);
    
    if (error) {
      console.error('❌ Error fetching blogs:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch blogs', details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!blogs || blogs.length === 0) {
      console.log('✅ No blogs with credentials found');
      return new Response(
        JSON.stringify({ 
          message: 'No blogs with credentials found',
          migrated: 0,
          skipped: 0,
          errors: 0,
          total: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`📊 Found ${blogs.length} blogs with credentials`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: string[] = [];
    
    for (const blog of blogs) {
      try {
        const credentials = blog.cms_credentials;
        
        // Check if already encrypted
        if (typeof credentials === 'string') {
          if (isEncrypted(credentials)) {
            console.log(`⏭️  Blog ${blog.id} (${blog.cms_platform}) already encrypted, skipping`);
            skipped++;
            continue;
          }
        }
        
        // Encrypt credentials
        console.log(`🔒 Encrypting credentials for blog ${blog.id} (${blog.cms_platform})...`);
        const encrypted = await encryptCredentials(credentials);
        
        // Update database
        const { error: updateError } = await supabaseService
          .from('blogs')
          .update({ cms_credentials: encrypted })
          .eq('id', blog.id);
        
        if (updateError) {
          console.error(`❌ Error updating blog ${blog.id}:`, updateError);
          errorDetails.push(`Blog ${blog.id}: ${updateError.message}`);
          errors++;
        } else {
          console.log(`✅ Migrated blog ${blog.id}`);
          migrated++;
        }
      } catch (error: any) {
        console.error(`❌ Error processing blog ${blog.id}:`, error.message);
        errorDetails.push(`Blog ${blog.id}: ${error.message}`);
        errors++;
      }
    }
    
    console.log('');
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📝 Total: ${blogs.length}`);
    
    return new Response(
      JSON.stringify({
        message: 'Migration completed',
        migrated,
        skipped,
        errors,
        total: blogs.length,
        errorDetails: errorDetails.length > 0 ? errorDetails : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Error in migration:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
