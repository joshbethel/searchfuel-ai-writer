// Type declarations for remote Deno / ESM imports used by Supabase Edge Functions
// These are intentionally loose — they only exist to quiet the TypeScript language server
// in the editor for remote imports like https://deno.land/... and https://esm.sh/...

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  import type { SupabaseClient } from '@supabase/supabase-js';
  export function createClient(url: string, key: string): SupabaseClient;
}

declare module "https://esm.sh/@supabase/supabase-js@2.7.1" {
  import type { SupabaseClient } from '@supabase/supabase-js';
  export function createClient(url: string, key: string): SupabaseClient;
}

// fallback for other esm.sh variants we might have used
declare module "https://esm.sh/*" { const whatever: any; export default whatever; }
