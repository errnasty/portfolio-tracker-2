import type { PremiumFrequency, PaymentRepeat } from '@/types'

// Number of premium payments per year for each frequency (single/none = 0,
// i.e. no recurring annual cost).
const PER_YEAR: Record<PremiumFrequency, number> = {
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  single: 0,
  none: 0,
}

// Annualized premium cost in the policy's currency. A single-premium or
// no-premium policy has no recurring annual cost.
export function annualizedPremium(amount: number | null | undefined, frequency: PremiumFrequency): number {
  const a = Number(amount) || 0
  return a * (PER_YEAR[frequency] ?? 0)
}

// Map a premium frequency to the planned_payments recurrence vocabulary, so a
// premium can be booked into the Upcoming list. single/none -> a one-off.
export function frequencyToRepeat(frequency: PremiumFrequency): PaymentRepeat {
  switch (frequency) {
    case 'monthly': return 'monthly'
    case 'quarterly': return 'quarterly'
    case 'yearly': return 'yearly'
    default: return 'none'
  }
}

// Does this policy carry a recurring premium that belongs in Upcoming?
export function hasRecurringPremium(amount: number | null | undefined, frequency: PremiumFrequency): boolean {
  return (Number(amount) || 0) > 0 && (frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly')
}

// Days until a policy expires (end_date), or null if no end date. Negative =
// already expired.
export function daysUntilExpiry(endDate: string | null | undefined, today: string): number | null {
  if (!endDate) return null
  const end = new Date(endDate).getTime()
  const now = new Date(today).getTime()
  if (isNaN(end) || isNaN(now)) return null
  return Math.round((end - now) / 86_400_000)
}
