import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Rate limiting utility for Supabase Edge Functions
 * Uses database table to track request counts per identifier (IP or user ID)
 * Requires rate_limits table (see migration: 20251114155549_create_rate_limits_table.sql)
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
  supabaseService: ReturnType<typeof createClient>
): Promise<RateLimitResult> {
  const { maxRequests, windowSeconds } = config;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const key = `rate_limit_${identifier}_${windowStart}`;
  const resetAt = windowStart + windowSeconds;

  try {
    // Try to get current count from database
    const { data: existing, error: getError } = await supabaseService
      .from('rate_limits')
      .select('count, reset_at')
      .eq('key', key)
      .single() as { data: { count: number; reset_at: number } | null; error: { code?: string; message?: string } | null };

    let currentCount = 0;
    if (!getError && existing) {
      currentCount = existing.count || 0;
    } else if (getError && getError.code !== 'PGRST116') {
      // PGRST116 = not found (which is OK for new entries)
      // Other errors should be logged but we'll fail open
      console.error('Rate limit check error:', getError);
    }

    if (currentCount >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing?.reset_at || resetAt,
      };
    }

    // Increment count (upsert)
    const newCount = currentCount + 1;
    const { error: upsertError } = await (supabaseService
      .from('rate_limits') as any)
      .upsert({
        key,
        identifier,
        count: newCount,
        reset_at: resetAt,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'key',
      });

    if (upsertError) {
      console.error('Rate limit update error:', upsertError);
      // On error, allow the request (fail open)
      return {
        allowed: true,
        remaining: maxRequests - newCount,
        resetAt,
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - newCount,
      resetAt,
    };
  } catch (error) {
    console.error('Rate limit check exception:', error);
    // On exception, allow the request (fail open)
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt,
    };
  }
}

/**
 * Get identifier for rate limiting (IP address or user ID)
 */
export function getRateLimitIdentifier(req: Request, userId?: string): string {
  // Prefer user ID if authenticated
  if (userId) {
    return `user:${userId}`;
  }
  
  // Fall back to IP address
  // Try to get IP from various headers (for proxies/load balancers)
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  
  const ip = cfConnectingIp || realIp || (forwardedFor ? forwardedFor.split(',')[0].trim() : null);
  
  if (ip) {
    return `ip:${ip}`;
  }
  
  // Fallback to a default identifier if IP cannot be determined
  return 'ip:unknown';
}

/**
 * Create rate limit error response
 */
export function createRateLimitResponse(
  resetAt: number,
  corsHeaders: Record<string, string>
): Response {
  const retryAfter = Math.ceil(resetAt - Date.now() / 1000);
  
  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter,
      resetAt: new Date(resetAt * 1000).toISOString(),
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Reset': resetAt.toString(),
      },
    }
  );
}

