// Type definitions for Deno runtime APIs used in Supabase Edge Functions
// These declarations help TypeScript understand Deno-specific globals

declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    toObject(): { [key: string]: string };
  }

  export const env: Env;

  export interface ConnInfo {
    localAddr: Deno.Addr;
    remoteAddr: Deno.Addr;
  }

  export interface Addr {
    transport: "tcp" | "udp";
    hostname: string;
    port: number;
  }

  export interface RequestEvent {
    request: Request;
    respondWith(r: Response | Promise<Response>): Promise<void>;
  }
}