'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getInboundAddress } from '@/lib/inbound'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Sparkles, Landmark, Mail, Wallet, Banknote, CalendarClock, Briefcase,
  PartyPopper, Copy, ChevronDown, ChevronUp, ArrowRight, Command, Moon,
  Keyboard, Bot, ListChecks, Upload, PiggyBank, HandHeart, Users, PieChart,
  Sliders, ArrowLeftRight, BookOpen, Smartphone, Vault,
} from 'lucide-react'

// Event other components fire to launch the tour (welcome dialog, Guide page).
export const START_TOUR_EVENT = 'aureus:start-tour'
export const TOUR_DONE_KEY = 'aureus_tour_done'

export function startTour() {
  window.dispatchEvent(new Event(START_TOUR_EVENT))
}

interface TourPoint { icon: React.ElementType; title: string; desc: string }
interface TourStep {
  href: string                 // page shown behind the wizard for this step
  icon: React.ElementType
  title: string
  subtitle: string
  points: TourPoint[]
  chips?: { icon: React.ElementType; label: string }[]
  showAddress?: boolean        // renders the user's forwarding address box
}

const STEPS: TourStep[] = [
  {
    href: '/dashboard',
    icon: Sparkles,
    title: 'Welcome to Aureus',
    subtitle: 'Your money and investments, all in one place. This quick tour walks the app behind this card.',
    points: [
      { icon: Wallet, title: 'Home = net worth', desc: 'Bank accounts, cash, and your portfolio roll into one number, snapshotted daily.' },
    ],
    chips: [
      { icon: Command, label: '⌘K palette & quick actions' },
      { icon: Keyboard, label: 'a = add expense' },
      { icon: Smartphone, label: 'Installable app' },
      { icon: Moon, label: 'Dark mode' },
    ],
  },
  {
    href: '/accounts',
    icon: Landmark,
    title: 'Start with your accounts',
    subtitle: 'Add each bank, cash, credit and e-wallet account — this is the foundation everything else builds on.',
    points: [
      { icon: Landmark, title: 'Any currency', desc: 'SGD, USD, AUD… every balance converts to your base currency for the totals.' },
      { icon: ArrowLeftRight, title: 'Transfers', desc: 'Move money between accounts without it counting as spending or income.' },
      { icon: Vault, title: 'Assets & debts too', desc: 'CPF, fixed deposits, property, and loans live in the tabs up top — net worth covers everything.' },
    ],
  },
  {
    href: '/settings',
    icon: Mail,
    title: 'Auto transaction logging',
    subtitle: 'Forward bank notification emails to your private address and we parse the amount, merchant, and category — no manual entry.',
    points: [],
    showAddress: true,
    chips: [
      { icon: Bot, label: 'AI categorization' },
      { icon: ListChecks, label: 'Review queue' },
      { icon: Upload, label: 'CSV import too' },
    ],
  },
  {
    href: '/spending',
    icon: Wallet,
    title: 'Spending & budgets',
    subtitle: 'Every expense lands here, auto-categorized. Budgets keep each category honest.',
    points: [
      { icon: Wallet, title: 'Fix categories inline', desc: 'One dropdown per row — add your own rules so the same merchant sticks next time.' },
      { icon: PiggyBank, title: 'Budgets & history', desc: 'Set monthly limits, then watch income vs spending vs savings across any range of months.' },
    ],
  },
  {
    href: '/income',
    icon: Banknote,
    title: 'Income & tithing',
    subtitle: 'Money in, split by source — salary, people, interest — with a tithing pool if you want one.',
    points: [
      { icon: Banknote, title: 'Salary & sources', desc: 'Incoming PayNow, GIRO salary, and interest are detected and bucketed automatically.' },
      { icon: HandHeart, title: 'Tithing pool', desc: 'Sets aside a % of your salary (adjustable); Giving-category spending clears it.' },
    ],
  },
  {
    href: '/payments',
    icon: CalendarClock,
    title: 'Payments & people',
    subtitle: 'Deadlines you must pay, subscriptions you forgot about, and friends who still owe you.',
    points: [
      { icon: CalendarClock, title: 'Upcoming bills', desc: 'Recurring deadlines with one-click Google Calendar links and .ics export.' },
      { icon: Users, title: 'IOUs', desc: 'The People page nets what they owe you against what you owe them, tagged by occasion.' },
    ],
  },
  {
    href: '/holdings',
    icon: Briefcase,
    title: 'Your portfolio',
    subtitle: 'The invest side: positions, performance, and what to buy next.',
    points: [
      { icon: Briefcase, title: 'Holdings hub', desc: 'Transactions and dividends live in tabs right here.' },
      { icon: PieChart, title: 'Analytics', desc: 'Performance, risk, valuation signals, and a printable report — one tab row.' },
      { icon: Sliders, title: 'Rebalancer', desc: 'Tell it your target allocation; it tells you what to buy when cash lands.' },
    ],
  },
  {
    href: '/dashboard',
    icon: PartyPopper,
    title: "You're all set",
    subtitle: 'Add an account and forward one bank email — the rest fills itself in.',
    points: [
      { icon: BookOpen, title: 'The Guide has your back', desc: 'Setup steps, tips, and release notes — and this tour can be replayed from there.' },
      { icon: Sparkles, title: "What's new, automatically", desc: 'Whenever the app updates, a once-only popup summarizes what changed.' },
    ],
  },
]

export function OnboardingTour() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [address, setAddress] = useState<string | null>(null)
  const [howToOpen, setHowToOpen] = useState(false)

  useEffect(() => {
    const start = () => { setStep(0); setOpen(true) }
    window.addEventListener(START_TOUR_EVENT, start)
    return () => window.removeEventListener(START_TOUR_EVENT, start)
  }, [])

  // Fetch the user's real forwarding address so the email step is concrete.
  useEffect(() => {
    if (!open || address) return
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      try {
        const addr = await getInboundAddress(session.user.id)
        if (addr) setAddress(addr.address)
      } catch { /* card on Settings will provision it */ }
    })()
  }, [open, address])

  // Walk the app: each step navigates behind the (lightly dimmed) wizard.
  useEffect(() => {
    if (!open) return
    router.push(STEPS[step].href)
    setHowToOpen(false)
  }, [open, step, router])

  const finish = () => {
    try { window.localStorage.setItem(TOUR_DONE_KEY, '1') } catch { /* ignore */ }
    setOpen(false)
  }

  const copyAddress = async () => {
    if (!address) return
    try { await navigator.clipboard.writeText(address); toast.success('Address copied') }
    catch { toast.error('Could not copy — find it in Settings') }
  }

  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const Icon = s.icon

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) finish() }}>
      <DialogPrimitive.Portal>
        {/* Lighter overlay than the standard dialog: the page behind IS the tour. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onEscapeKeyDown={finish}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="fixed left-[50%] top-[50%] z-50 w-[calc(100vw-2rem)] max-w-xl translate-x-[-50%] translate-y-[-50%] rounded-xl border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {/* Header — centered, finvue-style */}
          <div className="mb-4 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
              <Icon className="h-6 w-6 text-accent" />
            </div>
            <DialogPrimitive.Title className="text-xl font-semibold tracking-tight">{s.title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 max-w-md text-sm text-muted-foreground">
              {s.subtitle}
            </DialogPrimitive.Description>
          </div>

          <div className="space-y-3">
            {s.showAddress && (
              <div className="rounded-lg border border-border p-4">
                <div className="mb-1 text-sm font-medium">Your private forwarding address</div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Nothing connects to your bank account — only its notification emails are read.
                </p>
                {address ? (
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">{address}</code>
                    <Button size="icon" variant="outline" onClick={copyAddress} title="Copy address">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    Being set up — it&apos;s always visible in Settings → Bank email forwarding.
                  </div>
                )}
                <button
                  onClick={() => setHowToOpen((v) => !v)}
                  className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  How to set up auto-forwarding
                  {howToOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {howToOpen && (
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                    <li>Gmail → Settings → Forwarding and POP/IMAP → <strong>Add a forwarding address</strong> → paste the address above</li>
                    <li>Google&apos;s confirmation code appears on the Settings page here — paste it back into Gmail</li>
                    <li>Create a filter: From = your bank&apos;s alert address → action &quot;Forward to&quot; your address</li>
                    <li>Done — new bank emails are parsed and logged automatically</li>
                  </ol>
                )}
              </div>
            )}

            {s.points.map((p) => (
              <div key={p.title} className="flex items-start gap-3 rounded-lg border border-border p-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)]">
                  <p.icon className="h-4 w-4 text-accent" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.desc}</div>
                </div>
              </div>
            ))}

            {s.chips && (
              <div>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Also included</div>
                <div className="flex flex-wrap gap-1.5">
                  {s.chips.map((c) => (
                    <span key={c.label} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                      <c.icon className="h-3 w-3 text-accent" /> {c.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer: Back · dots · Next */}
          <div className="mt-5 flex items-center justify-between gap-3">
            {step === 0 ? (
              <button onClick={finish} className="text-sm text-muted-foreground hover:text-foreground">Skip tour</button>
            ) : (
              <button onClick={() => setStep((n) => n - 1)} className="text-sm text-muted-foreground hover:text-foreground">Back</button>
            )}
            <div className="flex items-center gap-1.5" aria-hidden>
              {STEPS.map((_, i) => (
                <span key={i} className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-4 bg-accent' : 'w-1.5 bg-border')} />
              ))}
            </div>
            <Button onClick={() => (last ? finish() : setStep((n) => n + 1))} className="min-w-[110px]">
              {last ? 'Got it' : 'Next'} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
