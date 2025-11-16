// Plan limits configuration
export const PLAN_LIMITS = {
  free: {
    maxPostsPerMonth: 3,
    maxKeywordsTotal: 10,
    features: {
      backlinkNetwork: false,
      competitorAnalysis: false,
      analytics: false,
      whiteLabel: false,
      customDomain: false,
      autoPosting: false
    }
  },
  pro: {
    maxPostsPerMonth: 20,
    maxKeywordsTotal: 100,
    features: {
      backlinkNetwork: true,
      competitorAnalysis: true,
      analytics: true,
      whiteLabel: true,
      customDomain: true,
      autoPosting: true
    }
  }
} as const;

// Subscription type (simplified)
export interface Subscription {
  plan_name: string;
  posts_generated_count: number;
  keywords_count: number;
  status: string;
}

// Utility functions
export function getPlanLimits(planName: string | null) {
  if (!planName) {
    // Return empty limits for no plan (all features disabled)
    return {
      maxPostsPerMonth: 0,
      maxKeywordsTotal: 0,
      features: {
        backlinkNetwork: false,
        competitorAnalysis: false,
        analytics: false,
        whiteLabel: false,
        customDomain: false,
        autoPosting: false
      }
    };
  }
  const plan = planName.toLowerCase() as keyof typeof PLAN_LIMITS;
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export function isOverLimit(
  subscription: Subscription,
  type: 'posts' | 'keywords'
): boolean {
  const limits = getPlanLimits(subscription.plan_name);
  
  if (type === 'posts') {
    const limit = limits.maxPostsPerMonth;
    if (limit === null) return false; // Unlimited
    return subscription.posts_generated_count >= limit;
  } else {
    const limit = limits.maxKeywordsTotal;
    if (limit === null) return false; // Unlimited
    return subscription.keywords_count >= limit;
  }
}

export function validateUsageLimit(
  subscription: Subscription,
  type: 'posts' | 'keywords'
): void {
  if (isOverLimit(subscription, type)) {
    const limits = getPlanLimits(subscription.plan_name);
    const limit = type === 'posts' ? limits.maxPostsPerMonth : limits.maxKeywordsTotal;
    throw new Error(`You have reached your ${type} limit (${limit}). Please upgrade your plan.`);
  }
}

export function hasFeatureAccess(planName: string, feature: string): boolean {
  const limits = getPlanLimits(planName);
  return limits.features[feature as keyof typeof limits.features] || false;
}

