import { supabase } from "@/integrations/supabase/client";

/**
 * Get the site limit for a user based on their subscription
 */
export async function getSiteLimit(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('sites_allowed')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching site limit:', error);
      return 1; // Default to 1 if error
    }

    // Return sites_allowed or default to 1
    return data?.sites_allowed || 1;
  } catch (error) {
    console.error('Error in getSiteLimit:', error);
    return 1; // Default to 1 on error
  }
}

/**
 * Get the current number of sites for a user
 */
export async function getSiteCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('blogs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching site count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Error in getSiteCount:', error);
    return 0;
  }
}

/**
 * Check if a user can create more sites
 */
export async function canCreateSite(userId: string): Promise<boolean> {
  try {
    const [siteLimit, siteCount] = await Promise.all([
      getSiteLimit(userId),
      getSiteCount(userId),
    ]);

    return siteCount < siteLimit;
  } catch (error) {
    console.error('Error in canCreateSite:', error);
    return false; // Fail safe - don't allow creation on error
  }
}

/**
 * Get the number of remaining sites a user can create
 */
export async function getRemainingSites(userId: string): Promise<number> {
  try {
    const [siteLimit, siteCount] = await Promise.all([
      getSiteLimit(userId),
      getSiteCount(userId),
    ]);

    const remaining = siteLimit - siteCount;
    return Math.max(0, remaining); // Don't return negative
  } catch (error) {
    console.error('Error in getRemainingSites:', error);
    return 0;
  }
}

/**
 * Get site limit information for display
 */
export async function getSiteLimitInfo(userId: string): Promise<{
  limit: number;
  count: number;
  remaining: number;
  canCreate: boolean;
}> {
  try {
    const [limit, count] = await Promise.all([
      getSiteLimit(userId),
      getSiteCount(userId),
    ]);

    const remaining = Math.max(0, limit - count);
    const canCreate = count < limit;

    return {
      limit,
      count,
      remaining,
      canCreate,
    };
  } catch (error) {
    console.error('Error in getSiteLimitInfo:', error);
    return {
      limit: 1,
      count: 0,
      remaining: 1,
      canCreate: true,
    };
  }
}

