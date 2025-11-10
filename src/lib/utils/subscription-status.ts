// Map Stripe statuses to simplified internal statuses
export function mapStripeStatusToSubscriptionStatus(
  stripeStatus: string
): 'active' | 'inactive' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
    case 'past_due':
      return 'active';
    case 'paused':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
    case 'canceled':
    default:
      return 'inactive';
  }
}

// Check if subscription is active
export function isSubscriptionActive(status: string): boolean {
  return mapStripeStatusToSubscriptionStatus(status) === 'active';
}

