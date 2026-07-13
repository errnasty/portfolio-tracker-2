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
  // Income buckets: salary, money from people, interest — 'Income' stays as
  // the generic catch-all (refunds, cashback, dividends, anything unmatched).
  { name: 'Salary',            kind: 'income',   color: '#2E7D5B', icon: 'BriefcaseBusiness' },
  { name: 'From people',       kind: 'income',   color: '#3f8f86', icon: 'Users' },
  { name: 'Interest',          kind: 'income',   color: '#C6A96A', icon: 'Percent' },
  { name: 'Income',            kind: 'income',   color: '#2E7D5B', icon: 'Banknote' },
  { name: 'Groceries',         kind: 'expense',  color: '#3f8f86', icon: 'ShoppingCart' },
  { name: 'Food & Dining',     kind: 'expense',  color: '#b5732f', icon: 'Utensils' },
  { name: 'Transport',         kind: 'expense',  color: '#3f6fb0', icon: 'Car' },
  { name: 'Shopping',          kind: 'expense',  color: '#b07a86', icon: 'ShoppingBag' },
  { name: 'Bills & Utilities', kind: 'expense',  color: '#C6A96A', icon: 'ReceiptText' },
  { name: 'Entertainment',     kind: 'expense',  color: '#7a6f9a', icon: 'Clapperboard' },
  { name: 'Health',            kind: 'expense',  color: '#9a4a3f', icon: 'HeartPulse' },
  { name: 'Travel',            kind: 'expense',  color: '#3f8f86', icon: 'Plane' },
  { name: 'Education',         kind: 'expense',  color: '#3f6fb0', icon: 'GraduationCap' },
  { name: 'Giving',            kind: 'expense',  color: '#b07a86', icon: 'HandHeart' },
  { name: 'Transfers',         kind: 'transfer', color: '#9a8f7a', icon: 'ArrowLeftRight' },
  { name: 'Other',             kind: 'expense',  color: '#9a8f7a', icon: 'Shapes' },
]

// Keyword → category. Substrings are matched case-insensitively against the
// transaction description + merchant. Order matters: the first category with a
// hit wins, so list the more specific buckets earlier. Tuned for common
// Singapore merchants / DBS-POSB statement narratives.
const RULES: { category: string; keywords: string[] }[] = [
  // Income / money in (checked first so "Incoming PayNow", refunds, NS pay win).
  // Specific income buckets before the generic 'Income' catch-all.
  { category: 'Salary', keywords: [
    'salary', 'payroll', 'giro salary', 'sal /', 'mindef saf',
  ] },
  { category: 'Interest', keywords: [
    'interest earned', 'credit interest', 'interest credit', 'bonus interest',
  ] },
  { category: 'From people', keywords: [
    'incoming paynow', 'send back from paylah', 'ang pow', 'reimburse',
  ] },
  { category: 'Income', keywords: [
    'refund', 'cashback', 'cash back', 'dividend',
  ] },
  // Investment / brokerage top-ups → Transfers (kept high so they beat the
  // generic "PayNow Transfer" catch-all and aren't counted as spending).
  { category: 'Transfers', keywords: [
    'interactive br', 'rec trust', 'ibkr', 'tiger brokers', 'moomoo',
    'syfe', 'endowus', 'webull',
  ] },
  { category: 'Groceries', keywords: [
    'fairprice', 'fair price', 'ntuc', 'fp xtra', 'finest', 'cold storage', 'sheng siong',
    'giant', 'prime super', 'redmart', 'dairy farm', 'mustafa', 'don don donki', 'donki',
    '7-eleven', '7 eleven', 'cheers', 'az supermart', 'supermart', 'lifestylemart',
  ] },
  { category: 'Food & Dining', keywords: [
    'grabfood', 'grab*food', 'grab food', 'foodpanda', 'food panda', 'deliveroo',
    'mcdonald', 'kfc', 'starbucks', 'coffee', 'kopitiam', 'koufu', 'food republic',
    'subway', 'jollibee', 'burger', 'pizza', 'toast box', 'ya kun', 'breadtalk',
    'restaurant', 'dining', 'cafe', 'hawker', 'eatery', 'bakery', 'bubble tea', 'liho',
    'wingstop', 'popeyes', 'coco ichibanya', 'kajiken', 'playmade', 'mixue', 'mr coconut',
    'gelato', 'astons', 'sbcd', 'katsu', 'bari bari', 'fu lin', 'dopa dopa', 'llao llao',
    'udon', 'sushi', 'hup lee', 'kuching kolo', 'kolomee', 'duduxiang', 'xin feng seafood',
    'fortune food', 'jia xiang wei', 'hot palette', 'darkness dessert', 'joji', 'eccellente',
    'bhc chicken', 'sanook', 'drop foods', 'cantine', 'hanbaobao', 'yang guo fu', 'ding feng',
    'nasi padang', 'yew kee', 'huang pu soya', 'fitra chicken', 'ba guo grill', 'shun fa',
    'maixiang', 'turf n tide', 'ah ching claypot', 'qashier', 'vending', 'nyp sc',
    'tang xin', 'chateraise', 'homm dessert', 'yeah gelato', '4fingers', 'fr 313',
    'mami fita', 'sushi gogo', 'from there on', 'turkish lezzet', 'sananook', 'chaoyuan',
  ] },
  { category: 'Transport', keywords: [
    'helloride', 'bus/mrt', 'simplygo', 'transit', 'grab', 'gojek', 'tada',
    'comfortdelgro', 'comfort delgro', 'cdg', 'taxi', 'causewaylink', 'transitlink',
    'ez-link', 'ezlink', 'smrt', 'sbs transit', 'shell', 'esso', 'caltex', 'spc',
    'petrol', 'parking', 'season parking', 'erp',
  ] },
  { category: 'Bills & Utilities', keywords: [
    'm1 maxx', 'm1 ', 'singtel', 'starhub', 'simba', 'circles.life', 'circles life',
    'sp group', 'sp services', 'city gas', 'town council', 'conservancy', 'insurance',
    'prudential', ' aia', 'ntuc income', 'great eastern', 'spotify', 'netflix', 'disney',
    'youtube premium', 'google storage', 'google one', 'google*', 'icloud', 'apple.com/bill',
    'openai', 'chatgpt', 'anthropic', 'claude.ai', 'claude sub', 'canva', 'microsoft',
    'netlify', 'adobe', 'subscription',
  ] },
  { category: 'Health', keywords: [
    'clinic', 'hospital', 'polyclinic', 'pharmacy', 'dental', 'dentist', 'neua dental',
    'unity pharmacy', 'watsons', 'guardian', 'raffles medical', 'healthway', 'medical', 'optical',
  ] },
  { category: 'Travel', keywords: [
    'airbnb', 'agoda', 'booking.com', 'expedia', 'singapore airlines', 'scoot',
    'jetstar', 'airasia', 'emirates', 'hotel', 'klook', 'trip.com', 'changi airport',
  ] },
  { category: 'Entertainment', keywords: [
    'golden village', 'cathay cineplex', 'shaw theat', 'cinema', 'steam purchase',
    'steampowered', 'steam ', 'playstation', 'nintendo', 'sistic', 'ticketmaster',
    'card arena', 'dopamine', 'fever*', 'minecraft',
  ] },
  { category: 'Shopping', keywords: [
    'shopee', 'lazada', 'amazon', 'qoo10', 'uniqlo', 'zalora', 'decathlon', 'ikea',
    'courts', 'challenger', 'apple store', 'taobao', 'aliexpress', 'h&m', 'sephora',
    'kinokuniya', 'takashimaya', 'g2000', 'floristique', 'flowersandkisses', 'brilliant prints',
  ] },
  { category: 'Education', keywords: [
    'national university of singapor', 'nanyang technological', 'singapore management',
    'singapore university of tech', 'singapore institute of tech', "s'pore institute of tech",
    'sutd', 'ntu -', 'smu singapore', 'tuition', 'school fees', 'course fee', 'udemy', 'coursera',
  ] },
  { category: 'Giving', keywords: [
    'faith community baptist', 'fcbc', 'missions faith', 'church', 'donation', 'donate',
    'offering', 'charity', 'tithe', 'community chest', 'giving.sg',
  ] },
  // Generic transfers — LAST, so a merchant keyword above always wins. Pure
  // peer-to-peer PayNow/GIRO with no merchant match lands here (excluded from spend).
  { category: 'Transfers', keywords: [
    'paynow transfer', 'paynow', 'paylah', 'fund transfer', 'funds transfer',
    'i-bank', 'ibank', 'giro', 'atm', 'cash withdrawal', 'top up', 'topup',
    'transfer to', 'transfer from',
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
