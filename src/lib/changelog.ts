// App changelog. The newest entry's version drives the "What's new" dialog:
// bump the version (any new string) whenever you ship something users should
// hear about, and add an entry at the TOP of this list.

export interface ChangelogItem {
  title: string
  desc: string
  href?: string                // deep link to the feature
}

export interface ChangelogEntry {
  version: string              // e.g. '2026.07'
  date: string                 // YYYY-MM-DD
  title: string
  items: ChangelogItem[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026.07',
    date: '2026-07-13',
    title: 'Money update: income, payments, people & more',
    items: [
      { title: 'Income page', desc: 'Income by source (salary, people, interest), month-over-month trends, and manual salary entry.', href: '/income' },
      { title: 'Tithing pool', desc: 'Automatically sets aside a % of income; Giving transactions clear it. Enable it on the Income page.', href: '/income' },
      { title: 'Upcoming payments', desc: 'Track bill deadlines with recurrence, add them to Google Calendar, or export everything as .ics.', href: '/payments' },
      { title: 'People (IOUs)', desc: 'Track who owes you and what you owe, netted per person, grouped by occasion or friend group.', href: '/people' },
      { title: 'Account transfers', desc: 'Move money between accounts — or mark a "spend" as a transfer to savings — without it counting as expense or income.', href: '/spending' },
      { title: 'More currencies', desc: 'Accounts and transactions now support AUD, GBP, JPY, MYR and a dozen more, with live FX conversion.', href: '/settings' },
      { title: 'Spending history', desc: 'Budgets page now charts income, spending, and savings over the last 3/6/12 months or any custom range.', href: '/budgets' },
      { title: 'Account drill-down', desc: 'Click any account card to see its balance, monthly in/out, and recent activity.', href: '/spending' },
      { title: 'Cleaner navigation', desc: 'Related screens are grouped under tabs (Holdings · Transactions · Dividends, Payments · Subscriptions) so the sidebar stays tidy.' },
      { title: 'Email forwarding verification', desc: 'Gmail\'s forwarding confirmation code now appears right in Settings — no more being stuck on "verify your address".', href: '/settings' },
    ],
  },
  {
    version: '2026.06',
    date: '2026-06-20',
    title: 'Bank email forwarding',
    items: [
      { title: 'Forward bank alerts', desc: 'Every user gets a private inbound address; forwarded DBS/POSB alerts are parsed and logged automatically.', href: '/settings' },
      { title: 'Review queue', desc: 'Low-confidence parses and possible duplicates wait for your confirmation instead of polluting the ledger.', href: '/spending' },
    ],
  },
]

export const LATEST_VERSION = CHANGELOG[0].version

// localStorage key for the last version the user has seen.
export const SEEN_VERSION_KEY = 'aureus_seen_version'

export function entriesSince(version: string | null): ChangelogEntry[] {
  if (!version) return CHANGELOG
  return CHANGELOG.filter((e) => e.version > version)
}
