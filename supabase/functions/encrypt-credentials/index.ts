// supabase/functions/encrypt-credentials/index.ts
// Edge function to encrypt credentials (called from frontend)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encryptCredentials } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { credentials } = await req.json();
    
    if (!credentials) {
      return new Response(
        JSON.stringify({ error: "Credentials required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Encrypt credentials
    const encrypted = await encryptCredentials(credentials);
    
    return new Response(
      JSON.stringify({ encrypted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Encryption error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to encrypt credentials" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

