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
    version: '2026.07.14',
    date: '2026-07-15',
    title: 'Liquid vs locked, and investment-linked plans',
    items: [
      { title: 'Locked-money timeline', desc: 'Mark holdings, assets (SRS, locked deposits) and policies with a "locked until" date. The Net worth page now splits your wealth into what you can access now vs what\'s locked, with a timeline of when each unlocks. CPF is always treated as locked.', href: '/networth' },
      { title: 'Investment-linked plans (ILP)', desc: 'The Insurance ILP type now tracks current investment value, surrender value, and the date you can exit penalty-free — the invested value counts toward net worth (and shows as locked until the exit date).', href: '/insurance' },
    ],
  },
  {
    version: '2026.07.13',
    date: '2026-07-15',
    title: 'Insurance and individual bonds',
    items: [
      { title: 'Insurance policies', desc: 'A new Insurance tab (Accounts → Insurance) tracks life, health, and general policies: sum assured, premiums (which show up on Payments), and any cash/surrender value — which counts toward your net worth.', href: '/insurance' },
      { title: 'Individual bonds', desc: 'Add corporate/SGS/retail bonds under Assets & debts with their coupon rate, coupon frequency, par value, and maturity — and the maturity lands on your Payments timeline. (Bond funds/ETFs go under Holdings; investment-linked plans under Insurance.)', href: '/assets' },
    ],
  },
  {
    version: '2026.07.12',
    date: '2026-07-15',
    title: 'Easier to get around, especially on your phone',
    items: [
      { title: 'Bottom tab bar on mobile', desc: 'Phones now have a thumb-reachable bottom bar — Home, Spending, a center + to add, Accounts, and Invest — so you\'re not digging through the hamburger menu for the essentials.', href: '/dashboard' },
      { title: 'Jump to a transaction', desc: 'Search a transaction in ⌘K, or tap INSPECT on an anomaly flag, and you land right on that row with it highlighted — no more scrolling to find it.', href: '/spending' },
      { title: 'People moved under Payments', desc: 'People (IOUs) is now a tab alongside Upcoming and Subscriptions, tidying the sidebar.', href: '/people' },
    ],
  },
  {
    version: '2026.07.11',
    date: '2026-07-15',
    title: 'Paste a bank SMS, get a transaction',
    items: [
      { title: 'Paste to capture', desc: 'The quick-add box (press a, or the mobile + button) has a new "Paste bank alert" tab — drop in a bank SMS or notification email and it extracts the amount, date, and merchant for you (with AI as a fallback for unfamiliar formats). Also on ⌘K as "Paste bank SMS / email".', href: '/spending' },
    ],
  },
  {
    version: '2026.07.10',
    date: '2026-07-15',
    title: 'Unlisted funds: correct, reliable pricing',
    items: [
      { title: 'Funds priced from Yahoo', desc: 'Unit trusts on Yahoo Finance (many LionGlobal/Fullerton/Nikko classes) now auto-update from their Morningstar code (e.g. 0P00006G00.SI). Each share class has its own code and price — test-fetch and confirm it matches your statement before saving.', href: '/holdings' },
      { title: 'One-click manual NAV', desc: 'For fund classes not on Yahoo — like monthly-distribution (MDist) classes — enter the NAV yourself and update it right from the holdings row in one click. (The previous auto-scrape of fund-house websites was unreliable and has been removed.)', href: '/holdings' },
    ],
  },
  {
    version: '2026.07.9',
    date: '2026-07-15',
    title: 'Bank email capture, live — even without a domain',
    items: [
      { title: 'Free relay address', desc: 'You no longer need your own domain to auto-capture bank emails. Sign up for a free inbound-email relay (CloudMailin or Postmark), paste the address it gives you into Settings, and forwarded bank alerts flow straight into your ledger.', href: '/settings' },
      { title: 'Works with more providers', desc: 'The email webhook now understands CloudMailin, Postmark, and raw-forwarded formats, and reliably identifies you even when Gmail keeps the original recipient on an auto-forward.', href: '/settings' },
    ],
  },
  {
    version: '2026.07.8',
    date: '2026-07-15',
    title: 'Track gold, silver, platinum & palladium — and any commodity',
    items: [
      { title: 'Physical precious metals', desc: 'Holdings now supports gold, silver, platinum, and palladium as their own price sources — pick a weight unit (gram, troy ounce, tael, or kilogram) and the live global spot price refreshes automatically, converted to that unit. Priced in USD regardless of what currency you actually paid in.', href: '/holdings' },
      { title: 'Commodity tickers in search', desc: 'Futures and commodity contracts (oil, agriculture, and more) now show up when searching for a holding — previously only stocks, ETFs, funds, and crypto did.', href: '/holdings' },
    ],
  },
  {
    version: '2026.07.7',
    date: '2026-07-15',
    title: 'Track funds Yahoo Finance doesn\'t know about',
    items: [
      { title: 'Add unlisted funds', desc: 'Holdings has a "Manual or unlisted fund" mode for positions without a standard Yahoo ticker — enter shares and cost basis as usual, and set the price from a data source or by hand. (See the latest entry above for how fund pricing works now.)', href: '/holdings' },
      { title: 'Fixed unreadable tips', desc: 'Tip boxes and other muted callouts (like the holdings search tip) were the same color as their own background in light mode, making the text invisible. Fixed.', href: '/holdings' },
    ],
  },
  {
    version: '2026.07.6',
    date: '2026-07-14',
    title: 'CPF on autopilot, and finding anything fast',
    items: [
      { title: 'CPF tab', desc: 'CPF now has its own tab (Accounts → CPF) with your OA, Special and MediSave balances, contribution history, and an age-based allocation breakdown.', href: '/cpf' },
      { title: 'Automatic CPF from salary', desc: 'Enable it once with your birth year: every Salary you record adds the full 37% (20% employee + 17% employer of your gross wage) into CPF, split by age band and capped at the wage ceiling. Your take-home is treated as 80% of gross.', href: '/cpf' },
      { title: 'Search everything in ⌘K', desc: 'The command palette now finds your holdings, assets, and recent transactions — not just pages and actions.', href: '/dashboard' },
      { title: 'Data-health warnings', desc: 'Home now tells you when live prices or exchange rates are unavailable, instead of quietly showing blanks.', href: '/dashboard' },
      { title: 'Guided first run', desc: 'A brand-new account gets a “start here” checklist on Home instead of empty panels.', href: '/dashboard' },
    ],
  },
  {
    version: '2026.07.5',
    date: '2026-07-14',
    title: 'The app starts telling you things',
    items: [
      { title: 'Smarter attention inbox', desc: 'Home now flags overdue and due-soon bills, negative balances, maturing deposits, stale IOUs, and spending running ahead of budget pace — prioritized, with one-click fixes.', href: '/dashboard' },
      { title: 'Anomaly alerts', desc: 'Possible double charges, transactions far above a payee\'s usual amount, and subscription price increases get flagged automatically.', href: '/dashboard' },
      { title: 'Cashflow forecast', desc: 'A new Home card projects your bank balance to month end from your spending pace, scheduled salary/bills, and predicted subscription charges.', href: '/dashboard' },
      { title: 'Month-in-review digest', desc: 'For the first days of each month, Home summarizes the month that just ended: savings rate, budget verdict, biggest movers, and net-worth change.', href: '/dashboard' },
      { title: 'Money flow diagram', desc: 'The Budgets history now draws where money came from and where it went — income sources through to categories and savings.', href: '/budgets' },
    ],
  },
  {
    version: '2026.07.4',
    date: '2026-07-14',
    title: 'The complete picture: assets, debts & net worth',
    items: [
      { title: 'Assets & debts', desc: 'Track CPF (OA/SA/MA), fixed deposits, T-bills, SSBs, property, vehicles — and loans/mortgages — under Accounts → Assets & debts. All of it rolls into net worth.', href: '/assets' },
      { title: 'Loan payoff projections', desc: 'Give a loan its rate and monthly installment and the payoff date plus remaining interest are computed automatically.', href: '/assets' },
      { title: 'Maturity alerts', desc: 'Fixed deposits and T-bills nearing maturity appear on the Payments page so you can decide reinvestment in time.', href: '/payments' },
      { title: 'Net worth page', desc: 'A full-size trend chart with 3M/6M/1Y/All ranges and a breakdown of what your net worth is made of.', href: '/networth' },
      { title: 'Stock detail view', desc: 'Click any holding for its price chart (1D · 5D · 1M · 6M · YTD · 1Y · 5Y · ALL), range change, valuation stats, your position, and your trades.', href: '/holdings' },
    ],
  },
  {
    version: '2026.07.3',
    date: '2026-07-13',
    title: 'Capture everything, type almost nothing',
    items: [
      { title: 'Smart quick-add', desc: 'Press "a" (or the + button on mobile) and type "14.50 lunch grab" — amount, description and category are parsed for you. Start with + for income.' },
      { title: 'Recurring transactions', desc: 'Mark a planned payment "post as transaction" and salary or rent books itself every cycle — no bank email needed.', href: '/payments' },
      { title: 'Review queue superpowers', desc: 'Confirm all at once, set categories inline, and tick "remember" to save a rule that also fixes past uncategorized transactions.', href: '/spending' },
      { title: 'Rules apply backwards', desc: 'Every category rule now has an “apply to existing” button that cleans up your history, not just future imports.', href: '/settings' },
    ],
  },
  {
    version: '2026.07.2',
    date: '2026-07-13',
    title: 'Quick wins: install it, add anything from anywhere',
    items: [
      { title: 'Install as an app', desc: 'Aureus is now a PWA — add it to your phone or desktop home screen from the browser menu for an app-like experience.' },
      { title: 'Quick actions', desc: 'Press ⌘K and type "add" — expense, income, transfer, IOU, bill, holding, or goal from anywhere. Or just press "a" to log an expense.' },
      { title: 'Balance reconciliation', desc: 'In any account\'s detail view, type the real balance from your bank and the difference is booked automatically.', href: '/accounts' },
      { title: 'Crypto holdings', desc: 'Search BTC-USD, ETH-USD and friends in the holdings dialog — priced live, shown as their own asset class.', href: '/holdings' },
      { title: 'Goals from net worth', desc: 'Goals can now count your full net worth (accounts included), not just the portfolio — per-goal setting.', href: '/goals' },
      { title: 'Multi-currency imports fixed', desc: 'IBKR/CSV imports and the holdings dialog no longer coerce GBP, AUD, JPY (etc.) positions to USD.' },
    ],
  },
  {
    version: '2026.07.1',
    date: '2026-07-13',
    title: 'Accounts tab, guided tour & smarter tithing',
    items: [
      { title: 'Accounts page', desc: 'Bank, cash, credit and wallet accounts now have their own tab with combined totals, credit owed, and per-account drill-downs.', href: '/accounts' },
      { title: 'Guided tour', desc: 'A screen-by-screen walkthrough for new users — it pops up on first visit, or replay it anytime from the Guide.', href: '/guide' },
      { title: 'Tithing from salary', desc: 'The tithing pool now counts only Salary income by default; switch it to all income (and any rate) on the Income page.', href: '/income' },
    ],
  },
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
