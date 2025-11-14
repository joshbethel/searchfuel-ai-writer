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
 * Uses Supabase Storage (object storage) to track request counts per identifier (IP or user ID)
 * This approach doesn't require database migrations
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
  supabaseService: ReturnType<typeof createClient>
): Promise<RateLimitResult> {
  const { maxRequests, windowSeconds } = config;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const key = `rate_limit_${identifier}_${windowStart}.json`;

  try {
    // Try to get current count from storage
    const { data: fileData, error: getError } = await supabaseService
      .storage
      .from('rate-limits')
      .download(key);

    let currentCount = 0;
    if (!getError && fileData) {
      try {
        const text = await fileData.text();
        const parsed = JSON.parse(text);
        currentCount = parsed.count || 0;
      } catch (parseError) {
        console.error('Error parsing rate limit file:', parseError);
        currentCount = 0;
      }
    }

    const resetAt = windowStart + windowSeconds;

    if (currentCount >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Increment count
    const newCount = currentCount + 1;
    const newData = {
      identifier,
      count: newCount,
      resetAt,
      updatedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(newData)], { type: 'application/json' });
    const { error: uploadError } = await supabaseService
      .storage
      .from('rate-limits')
      .upload(key, blob, {
        upsert: true,
        contentType: 'application/json',
      });

    if (uploadError) {
      console.error('Rate limit update error:', uploadError);
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
      resetAt: windowStart + windowSeconds,
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

