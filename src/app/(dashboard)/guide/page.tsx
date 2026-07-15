'use client'

import { PageShell } from '@/components/ui/page-shell'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TLink } from '@/components/motion/TLink'
import { CHANGELOG } from '@/lib/changelog'
import { startTour } from '@/components/layout/OnboardingTour'
import {
  Landmark, Mail, Tags, PiggyBank, Briefcase, CalendarClock, Users, HandHeart,
  Sparkles, Keyboard, Wallet, TrendingUp, Compass, Smartphone, Vault,
} from 'lucide-react'

const STEPS: { icon: React.ElementType; title: string; body: React.ReactNode }[] = [
  {
    icon: Landmark,
    title: '1 · Add your accounts',
    body: <>Head to <TLink href="/accounts" className="text-accent hover:underline">Accounts</TLink> and add each bank, cash, credit and e-wallet account with its currency and current balance. Different currencies are fine — everything rolls up into your base currency (set in <TLink href="/settings" className="text-accent hover:underline">Settings</TLink>).</>,
  },
  {
    icon: Mail,
    title: '2 · Automate transaction capture',
    body: <>In <TLink href="/settings" className="text-accent hover:underline">Settings</TLink>, set up bank-email forwarding — no domain required. Sign up for a free relay (CloudMailin/Postmark), paste its address into the card, and auto-forward your bank alerts there via a Gmail filter; they&apos;re parsed and logged in seconds. If Gmail asks to verify the address, the confirmation code appears right on that card. Prefer files? Use <TLink href="/import" className="text-accent hover:underline">Import</TLink> for CSV statements, or add entries manually.</>,
  },
  {
    icon: Tags,
    title: '3 · Categorize as you go',
    body: <>Transactions auto-categorize by keyword and AI. Fix any misses inline on <TLink href="/spending" className="text-accent hover:underline">Spending</TLink> — and add your own rules in Settings so the same merchant lands right next time. Income splits by source (salary, people, interest) on the <TLink href="/income" className="text-accent hover:underline">Income</TLink> page.</>,
  },
  {
    icon: PiggyBank,
    title: '4 · Set budgets & watch trends',
    body: <>Give each category a monthly limit on <TLink href="/budgets" className="text-accent hover:underline">Budgets</TLink>. The History card there shows income, spending, and savings across any range of months.</>,
  },
  {
    icon: CalendarClock,
    title: '5 · Never miss a payment',
    body: <><TLink href="/payments" className="text-accent hover:underline">Payments</TLink> lists upcoming bill deadlines (yours plus detected subscriptions). Add any of them to Google Calendar with one click, or export the whole list as an .ics file.</>,
  },
  {
    icon: Briefcase,
    title: '6 · Track your portfolio',
    body: <>Add positions under <TLink href="/holdings" className="text-accent hover:underline">Holdings</TLink> (Transactions and Dividends live in tabs there). <TLink href="/analytics" className="text-accent hover:underline">Analytics</TLink> covers performance, risk and signals; the <TLink href="/rebalancer" className="text-accent hover:underline">Rebalancer</TLink> tells you what to buy when you add cash.</>,
  },
]

const EXTRAS: { icon: React.ElementType; title: string; body: React.ReactNode }[] = [
  { icon: Users, title: 'People', body: <>Split a bill or lend cash? Log it on <TLink href="/people" className="text-accent hover:underline">People</TLink> — balances net both directions per person, taggable by trip or group.</> },
  { icon: HandHeart, title: 'Tithing', body: <>Enable the tithing pool on <TLink href="/income" className="text-accent hover:underline">Income</TLink> to set aside a share of everything you earn; Giving-category spending clears it automatically.</> },
  { icon: PiggyBank, title: 'CPF (Singapore)', body: <>On the <TLink href="/cpf" className="text-accent hover:underline">CPF</TLink> tab, enable auto-contribution with your birth year — every salary you record adds the 37% employee+employer CPF into OA/SA/MediSave for you.</> },
  { icon: Wallet, title: 'Transfers', body: <>Moving money between your own accounts isn&apos;t spending. Use the transfer button on Spending, or the ⇄ icon on any transaction to reclassify it.</> },
  { icon: TrendingUp, title: 'Net worth', body: <>Accounts, investments, CPF, deposits, property and loans (add them under <TLink href="/assets" className="text-accent hover:underline">Assets &amp; debts</TLink>) roll into one number — see the full trend and breakdown on <TLink href="/networth" className="text-accent hover:underline">Net worth</TLink>.</> },
  { icon: Keyboard, title: 'Keyboard-first', body: <>Press <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">⌘K</kbd> for the command palette — it also adds expenses, transfers, IOUs, bills and holdings from anywhere. Press <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">a</kbd> to log an expense instantly, or use go-sequences like <span className="font-mono">g s</span> (spending).</> },
  { icon: Smartphone, title: 'Install it', body: <>Aureus is a PWA — on your phone choose “Add to Home Screen” from the browser menu (desktop: the install icon in the address bar) and it opens like a native app.</> },
  { icon: Vault, title: 'Funds & physical assets not on Yahoo Finance', body: <>Adding a holding, switch to <strong className="text-foreground">Manual or unlisted fund</strong> for anything the normal search doesn&apos;t quote. Unit trusts on Yahoo (many LionGlobal/Fullerton classes, code like <span className="font-mono">0P00006G00.SI</span>) auto-update — mind that each share class has its own code and price. For classes not on Yahoo (e.g. monthly-distribution MDist classes) enter the NAV and update it in one click from the holdings row. Physical gold, silver, platinum and palladium track live spot by weight (gram, troy ounce, tael, kilogram).</> },
]

export default function GuidePage() {
  return (
    <PageShell screen="Overview" title="Guide" statusRight={<span>getting started &amp; what&apos;s new</span>}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">Getting started</CardTitle>
                <CardDescription>Five minutes of setup and the app largely runs itself.</CardDescription>
              </div>
              <Button size="sm" onClick={startTour}>
                <Compass className="mr-2 h-3.5 w-3.5" /> Take the tour
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {STEPS.map((s) => (
                <div key={s.title} className="rounded-md border border-border p-4">
                  <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                    <s.icon className="h-4 w-4 text-accent" /> {s.title}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Good to know</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {EXTRAS.map((s) => (
                <div key={s.title}>
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                    <s.icon className="h-4 w-4 text-accent" /> {s.title}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> What&apos;s new</CardTitle>
            <CardDescription>Release notes — newest first. New updates also pop up once when you sign in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {CHANGELOG.map((e) => (
              <div key={e.version}>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{e.title}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{e.version} · {e.date}</span>
                </div>
                <ul className="space-y-1.5">
                  {e.items.map((item) => (
                    <li key={item.title} className="text-xs">
                      {item.href ? (
                        <TLink href={item.href} className="font-medium text-foreground hover:text-accent">{item.title}</TLink>
                      ) : (
                        <span className="font-medium text-foreground">{item.title}</span>
                      )}
                      <span className="text-muted-foreground"> — {item.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
