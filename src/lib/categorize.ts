import type { CategoryKind } from '@/types'

// Default categories seeded for a new user (see SpendingContext). The `name`
// values are the contract between the seeder and the auto-categorizer below —
// `guessCategoryName` only ever returns one of these names.
export interface DefaultCategory {
  name: string
  kind: CategoryKind
  color: string
  icon: string
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: 'Income',            kind: 'income',   color: '#22c55e', icon: 'Banknote' },
  { name: 'Groceries',         kind: 'expense',  color: '#16a34a', icon: 'ShoppingCart' },
  { name: 'Food & Dining',     kind: 'expense',  color: '#f97316', icon: 'Utensils' },
  { name: 'Transport',         kind: 'expense',  color: '#0ea5e9', icon: 'Car' },
  { name: 'Shopping',          kind: 'expense',  color: '#ec4899', icon: 'ShoppingBag' },
  { name: 'Bills & Utilities', kind: 'expense',  color: '#eab308', icon: 'ReceiptText' },
  { name: 'Entertainment',     kind: 'expense',  color: '#8b5cf6', icon: 'Clapperboard' },
  { name: 'Health',            kind: 'expense',  color: '#f43f5e', icon: 'HeartPulse' },
  { name: 'Travel',            kind: 'expense',  color: '#14b8a6', icon: 'Plane' },
  { name: 'Transfers',         kind: 'transfer', color: '#6b7280', icon: 'ArrowLeftRight' },
  { name: 'Other',             kind: 'expense',  color: '#94a3b8', icon: 'Shapes' },
]

// Keyword → category. Substrings are matched case-insensitively against the
// transaction description + merchant. Order matters: the first category with a
// hit wins, so list the more specific buckets earlier. Tuned for common
// Singapore merchants / DBS-POSB statement narratives.
const RULES: { category: string; keywords: string[] }[] = [
  { category: 'Income', keywords: [
    'salary', 'payroll', 'giro salary', 'sal /', 'interest earned', 'credit interest',
    'refund', 'cashback', 'cash back', 'dividend', 'ang pow', 'reimburse',
  ] },
  { category: 'Transfers', keywords: [
    'paynow', 'paylah', 'fund transfer', 'funds transfer', 'i-bank', 'ibank transfer',
    'giro', 'atm', 'cash withdrawal', 'top up', 'topup', 'transfer to', 'transfer from',
  ] },
  { category: 'Groceries', keywords: [
    'fairprice', 'fair price', 'ntuc', 'cold storage', 'sheng siong', 'giant',
    'prime super', 'redmart', 'dairy farm', 'mustafa', 'don don donki', 'donki',
  ] },
  { category: 'Food & Dining', keywords: [
    'grabfood', 'grab*food', 'grab food', 'foodpanda', 'food panda', 'deliveroo',
    'mcdonald', 'kfc', 'starbucks', 'coffee', 'kopitiam', 'koufu', 'food republic',
    'subway', 'jollibee', 'burger', 'pizza', 'toast box', 'ya kun', 'breadtalk',
    'restaurant', 'dining', 'cafe', 'hawker', 'eatery', 'bakery', 'bubble tea', 'liho',
  ] },
  { category: 'Transport', keywords: [
    'grab', 'gojek', 'tada', 'comfortdelgro', 'comfort delgro', 'cdg', 'taxi',
    'simplygo', 'transitlink', 'transit link', 'ez-link', 'ezlink', 'smrt', 'sbs transit',
    'shell', 'esso', 'caltex', 'spc', 'petrol', 'parking', 'season parking', 'erp',
  ] },
  { category: 'Bills & Utilities', keywords: [
    'singtel', 'starhub', 'm1 ', 'simba', 'sp group', 'sp services', 'city gas',
    'town council', 'conservancy', 'insurance', 'prudential', ' aia', 'ntuc income',
    'great eastern', 'spotify', 'netflix', 'disney', 'youtube premium', 'google storage',
    'google one', 'icloud', 'apple.com/bill', 'openai', 'chatgpt', 'adobe', 'subscription',
  ] },
  { category: 'Health', keywords: [
    'clinic', 'hospital', 'polyclinic', 'pharmacy', 'dental', 'dentist', 'unity',
    'watsons', 'guardian', 'raffles medical', 'healthway', 'medical', 'optical',
  ] },
  { category: 'Travel', keywords: [
    'airbnb', 'agoda', 'booking.com', 'expedia', 'singapore airlines', 'scoot',
    'jetstar', 'airasia', 'emirates', 'hotel', 'klook', 'trip.com', 'changi airport',
  ] },
  { category: 'Entertainment', keywords: [
    'golden village', 'cathay cineplex', 'shaw theat', 'cinema', 'steam games',
    'steampowered', 'playstation', 'nintendo', 'sistic', 'ticketmaster', 'spotify',
  ] },
  { category: 'Shopping', keywords: [
    'shopee', 'lazada', 'amazon', 'qoo10', 'uniqlo', 'zalora', 'decathlon', 'ikea',
    'courts', 'challenger', 'apple store', 'taobao', 'aliexpress', 'h&m', 'sephora',
  ] },
]

/**
 * Best-effort category for a spending row. Returns one of DEFAULT_CATEGORIES
 * names, or null when nothing matches (leave the row uncategorized).
 */
export function guessCategoryName(description: string, merchant?: string | null): string | null {
  const text = `${description ?? ''} ${merchant ?? ''}`.toLowerCase()
  if (!text.trim()) return null
  for (const rule of RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.category
  }
  return null
}
