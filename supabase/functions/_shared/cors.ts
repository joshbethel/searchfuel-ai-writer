// Secure CORS configuration with allowlist
const allowedOrigins = [
  "https://searchfuel-ai-writer.lovable.app",
  "https://preview--searchfuel-ai-writer.lovable.app",
  "https://ef7316e9-181c-4379-9b43-1c52f85bdf75.lovableproject.com",
  "https://app.trysearchfuel.com",
  "https://lovable.dev",
  "http://localhost:5173",
  "http://localhost:3000",
];

/**
 * Check if an origin is allowed to make requests
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  
  // Normalize origin by removing trailing slash
  const normalizedOrigin = origin.replace(/\/$/, '');
  
  // Check exact matches
  if (allowedOrigins.includes(normalizedOrigin)) return true;
  
  // Allow Lovable preview domains (*.lovableproject.com)
  if (normalizedOrigin.endsWith('.lovableproject.com')) return true;
  
  return false;
}

/**
 * Get CORS headers based on the request origin
 * @param origin - The origin from the request header
 * @param methods - Allowed HTTP methods (default: "GET, POST, OPTIONS")
 * @returns CORS headers object
 */
export function getCorsHeaders(origin: string | null, methods: string = "GET, POST, OPTIONS") {
  const isAllowed = isOriginAllowed(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "86400"
  };
}

/**
 * Legacy export for backward compatibility (deprecated - use getCorsHeaders instead)
 * @deprecated Use getCorsHeaders() with origin parameter instead
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};