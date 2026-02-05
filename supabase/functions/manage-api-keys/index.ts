import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getCorsHeaders } from "../_shared/cors.ts";

// Valid scopes that can be assigned to API keys
const VALID_SCOPES = [
  "posts:read",
  "posts:write", 
  "posts:publish",
  "sites:read",
  "keywords:read",
  "keywords:write",
  "full_access",
] as const;

// Scope presets for convenience
const SCOPE_PRESETS = {
  publish_only: ["posts:publish", "posts:read"],
  read_only: ["posts:read", "sites:read", "keywords:read"],
  full_access: ["full_access"],
} as const;

type ValidScope = typeof VALID_SCOPES[number];

// Generate a cryptographically secure random API key
function generateApiKey(): string {
  const prefix = "sk_live_";
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const randomPart = Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (byte) => chars[byte % chars.length]
  ).join("");
  return prefix + randomPart;
}

// Hash an API key using SHA-256
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Validate scopes array
function validateScopes(scopes: string[]): { valid: boolean; error?: string } {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return { valid: false, error: "At least one scope is required" };
  }
  
  for (const scope of scopes) {
    if (!VALID_SCOPES.includes(scope as ValidScope)) {
      return { valid: false, error: `Invalid scope: ${scope}. Valid scopes are: ${VALID_SCOPES.join(", ")}` };
    }
  }
  
  return { valid: true };
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;

    // Use service role for database operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse request body
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "create": {
        const { name, scopes, preset, expires_in_days } = body;

        // Validate name
        if (!name || typeof name !== "string" || name.trim().length === 0) {
          return new Response(
            JSON.stringify({ error: "Key name is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (name.length > 255) {
          return new Response(
            JSON.stringify({ error: "Key name must be 255 characters or less" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Determine scopes - use preset if provided, otherwise use custom scopes
        let finalScopes: string[];
        if (preset && SCOPE_PRESETS[preset as keyof typeof SCOPE_PRESETS]) {
          finalScopes = [...SCOPE_PRESETS[preset as keyof typeof SCOPE_PRESETS]];
        } else if (scopes) {
          const scopeValidation = validateScopes(scopes);
          if (!scopeValidation.valid) {
            return new Response(
              JSON.stringify({ error: scopeValidation.error }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          finalScopes = scopes;
        } else {
          // Default to publish_only preset
          finalScopes = [...SCOPE_PRESETS.publish_only];
        }

        // Calculate expiration date if provided
        let expiresAt: string | null = null;
        if (expires_in_days && typeof expires_in_days === "number" && expires_in_days > 0) {
          const expirationDate = new Date();
          expirationDate.setDate(expirationDate.getDate() + expires_in_days);
          expiresAt = expirationDate.toISOString();
        }

        // Generate the API key
        const apiKey = generateApiKey();
        const keyHash = await hashApiKey(apiKey);
        const keyPrefix = apiKey.substring(0, 12); // "sk_live_xxxx"

        // Check for duplicate key (extremely unlikely but handle it)
        const { data: existingKey } = await supabase
          .from("api_keys")
          .select("id")
          .eq("key_hash", keyHash)
          .single();

        if (existingKey) {
          // Regenerate key (collision is astronomically unlikely, but handle it)
          return new Response(
            JSON.stringify({ error: "Key generation failed. Please try again." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Insert the new key
        const { data: newKey, error: insertError } = await supabase
          .from("api_keys")
          .insert({
            user_id: userId,
            name: name.trim(),
            key_hash: keyHash,
            key_prefix: keyPrefix,
            scopes: finalScopes,
            expires_at: expiresAt,
          })
          .select("id, name, key_prefix, scopes, expires_at, created_at")
          .single();

        if (insertError) {
          console.error("Error creating API key:", insertError);
          return new Response(
            JSON.stringify({ error: "Failed to create API key" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Return the full key ONLY on creation (never stored, never shown again)
        return new Response(
          JSON.stringify({
            success: true,
            key: {
              id: newKey.id,
              name: newKey.name,
              key: apiKey, // Full key - shown only once!
              key_prefix: newKey.key_prefix,
              scopes: newKey.scopes,
              expires_at: newKey.expires_at,
              created_at: newKey.created_at,
            },
            warning: "This is the only time you will see this key. Copy it now and store it securely.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list": {
        // Fetch all keys for this user
        const { data: keys, error: listError } = await supabase
          .from("api_keys")
          .select("id, name, key_prefix, scopes, expires_at, created_at, last_used_at, revoked_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (listError) {
          console.error("Error listing API keys:", listError);
          return new Response(
            JSON.stringify({ error: "Failed to list API keys" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Add computed fields
        const now = new Date();
        const keysWithStatus = (keys || []).map((key) => ({
          ...key,
          is_expired: key.expires_at ? new Date(key.expires_at) < now : false,
          is_revoked: !!key.revoked_at,
          is_active: !key.revoked_at && (!key.expires_at || new Date(key.expires_at) >= now),
        }));

        return new Response(
          JSON.stringify({
            success: true,
            keys: keysWithStatus,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "revoke": {
        const { key_id } = body;

        if (!key_id) {
          return new Response(
            JSON.stringify({ error: "key_id is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify the key belongs to this user and revoke it
        const { data: revokedKey, error: revokeError } = await supabase
          .from("api_keys")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", key_id)
          .eq("user_id", userId)
          .is("revoked_at", null) // Only revoke if not already revoked
          .select("id, name, revoked_at")
          .single();

        if (revokeError) {
          if (revokeError.code === "PGRST116") {
            return new Response(
              JSON.stringify({ error: "API key not found or already revoked" }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          console.error("Error revoking API key:", revokeError);
          return new Response(
            JSON.stringify({ error: "Failed to revoke API key" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: `API key "${revokedKey.name}" has been revoked`,
            key: revokedKey,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete": {
        const { key_id } = body;

        if (!key_id) {
          return new Response(
            JSON.stringify({ error: "key_id is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Delete the key (only if it belongs to this user)
        const { data: deletedKey, error: deleteError } = await supabase
          .from("api_keys")
          .delete()
          .eq("id", key_id)
          .eq("user_id", userId)
          .select("id, name")
          .single();

        if (deleteError) {
          if (deleteError.code === "PGRST116") {
            return new Response(
              JSON.stringify({ error: "API key not found" }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          console.error("Error deleting API key:", deleteError);
          return new Response(
            JSON.stringify({ error: "Failed to delete API key" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: `API key "${deletedKey.name}" has been deleted`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ 
            error: "Invalid action", 
            valid_actions: ["create", "list", "revoke", "delete"] 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: any) {
    console.error("Error in manage-api-keys:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
