'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useReveal } from '@/lib/useReveal'

const FEATURES = [
  {
    n: '#1 · UNIFY',
    title: 'Everything, one number',
    body: 'Holdings, cash and bank accounts across currencies, priced live and rolled into a single net worth with 1D / 7D / 30D deltas you can trust.',
  },
  {
    n: '#2 · WATCH',
    title: 'Spending that files itself',
    body: 'Bank and card feeds auto-categorize into budgets. Catch forgotten subscriptions and protect your savings rate — no spreadsheet required.',
  },
  {
    n: '#3 · SEE THROUGH',
    title: 'Look-through analytics',
    body: 'Aureus decomposes ETFs into real country, sector and currency exposure — so you know what you truly own, and where two funds secretly overlap.',
  },
  {
    n: '#4 · REBALANCE',
    title: 'Drift, corrected',
    body: 'Set target weights and tolerance bands. Aureus flags drift and proposes the exact trades, then models contributions and FI timelines with backtests.',
  },
  {
    n: '#5 · SHELTER',
    title: 'Singapore-tax aware',
    body: 'Dividend and gains treatment built for SG residents — no US-centric assumptions, no manual reconciling to keep the numbers honest.',
  },
  {
    n: '#6 · UNDERSTAND',
    title: 'A plain-English verdict',
    body: 'A deterministic read on your position — what changed, what needs attention, what to do next. No black box, no per-render cost.',
  },
]

const GEO = [
  { label: 'United States', pct: 58 },
  { label: 'Europe', pct: 12 },
  { label: 'Emerging markets', pct: 9 },
  { label: 'Singapore', pct: 8 },
  { label: 'Japan', pct: 7 },
]

export default function LandingPage() {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [checking, setChecking] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Dark logo art is invisible on the dark-theme black background — swap to gold.
  const logoSrc = mounted && resolvedTheme === 'dark' ? '/aureus/face-gold.png' : '/aureus/face-ink.png'

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/dashboard')
      else setChecking(false)
    })
  }, [router])

  useReveal(!checking)
  if (checking) return null

  return (
    <div className="font-sans text-[var(--ink)]">
      {/* Scroll progress bar */}
      <ScrollProgress />

      {/* ═══ NAV ═══ */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-[14px]">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3.5 px-8 py-3.5">
          <div className="flex items-center gap-2.5">
            <Image src={logoSrc} alt="Aureus" width={34} height={34} className="block h-[34px] w-auto" />
            <span className="font-display text-[22px] text-foreground">Aureus</span>
          </div>
          <nav className="ml-11 hidden gap-7 text-[14px] text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Product</a>
            <a href="#analytics" className="transition-colors hover:text-foreground">Analytics</a>
            <a href="#" className="transition-colors hover:text-foreground">Docs</a>
          </nav>
          <div className="ml-auto flex items-center gap-5">
            <a href="/login" className="text-[14px] text-foreground/90 transition-colors hover:text-foreground">Sign in</a>
            <a href="/login" className="rounded-[10px] bg-gradient-to-br from-[#E4CE9A] to-[#C6A96A] px-[18px] py-2.5 text-[14px] font-semibold text-[#14140F] transition-all press">
              Claim account →
            </a>
          </div>
        </div>
      </header>

      {/* ═══ HERO ═══ */}
      <section className="relative flex min-h-[90vh] items-center overflow-hidden">
        <Image
          src="/aureus/roman-1.png"
          alt=""
          fill
          className="animate-au-scan object-cover opacity-[0.34]"
          style={{ filter: 'grayscale(1) contrast(1.08) brightness(1.04)' }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(700px_440px_at_50%_32%,rgba(198,169,106,0.22),transparent_62%),linear-gradient(180deg,hsl(var(--background)/0.28)_0%,hsl(var(--background)/0.22)_42%,hsl(var(--background))_100%)]" />

        <div className="relative z-10 mx-auto max-w-[900px] px-8 pb-[60px] pt-[72px] text-center">
          <div className="relative mb-[30px] inline-flex items-center justify-center animate-au-rise">
            <div className="absolute h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(198,169,106,0.30),transparent_62%)] animate-au-glow" />
            <Image src={logoSrc} alt="Aureus" width={236} height={236} className="relative w-[236px] animate-au-float drop-shadow-2xl" />
          </div>
          <div className="animate-au-rise font-mono text-[12px] uppercase tracking-[0.16em] text-[#93702C]" style={{ animationDelay: '0.12s' }}>
            Est · MMXXVI — private wealth, struck as one
          </div>
          <h1 className="animate-au-rise font-display text-[clamp(48px,7vw,88px)] font-medium leading-[0.98] tracking-[-0.02em] text-foreground" style={{ animationDelay: '0.2s' }}>
            Command your whole <em className="not-italic text-[#93702C]">fortune.</em>
          </h1>
          <p className="animate-au-rise mx-auto mt-6 max-w-[540px] text-[18px] leading-[1.62] text-muted-foreground" style={{ animationDelay: '0.3s' }}>
            Aureus unifies investments, cash and spending into one tax-aware console — with look-through analytics and plain-English answers. Calm as marble, precise as a mint.
          </p>
          <div className="animate-au-rise flex justify-center gap-3.5" style={{ animationDelay: '0.4s' }}>
            <a href="/login" className="rounded-[12px] bg-gradient-to-br from-[#E4CE9A] to-[#C6A96A] px-7 py-3.5 text-[15px] font-semibold text-[#14140F] transition-all press hover:translate-y-[-3px] hover:shadow-[0_14px_30px_rgba(198,169,106,0.45)]">
              Claim your account →
            </a>
            <a href="#analytics" className="rounded-[12px] border border-border bg-card px-[26px] py-3.5 text-[15px] font-semibold text-foreground transition-all press hover:border-[#C6A96A] hover:translate-y-[-3px] hover:shadow-[0_12px_26px_rgba(80,70,45,0.12)]">
              See the console
            </a>
          </div>
          <div className="animate-au-rise mt-9 flex flex-wrap justify-center gap-x-[26px] gap-y-2 font-mono text-[12px] uppercase tracking-[0.06em] text-faint" style={{ animationDelay: '0.5s' }}>
            <span>✓ Bank &amp; IBKR sync</span>
            <span>✓ SG-tax aware</span>
            <span>✓ Free to start</span>
          </div>
        </div>
      </section>

      {/* summary strip */}
      <div className="relative z-20 mx-auto -mt-6 max-w-[1240px] px-8">
        <div className="rounded-[14px] border border-border bg-card px-[22px] py-[18px] font-mono text-[13px] leading-[1.7] text-muted-foreground shadow-[0_8px_30px_rgba(80,70,45,0.06)]">
          <span className="text-[#93702C]">▸ aureus summary</span> &nbsp; Net worth <span className="text-foreground">$487,320</span> (<span className="text-up">+2.6% · 30D</span>). &nbsp; VWRA overweight <span className="text-down">+7.2%</span> — rebalance flagged. &nbsp; Savings rate <span className="text-foreground">52%</span>, ahead of plan.
        </div>
      </div>

      {/* trust strip */}
      <div className="mt-11 border-y border-border bg-secondary">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-6 px-8 py-5 font-mono text-[12px] uppercase tracking-[0.08em] text-faint">
          <span>Interactive Brokers</span>
          <span>DBS · POSB · OCBC</span>
          <span>Yahoo Finance</span>
          <span>Frankfurter FX</span>
          <span>Supabase</span>
        </div>
      </div>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="bg-background">
        <div className="mx-auto max-w-[1240px] px-8 py-[100px]">
          <div data-reveal className="mb-16 max-w-[640px]">
            <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#93702C]">The console</div>
            <h2 className="mt-4 font-display text-[clamp(34px,4.4vw,52px)] font-medium leading-[1.06] tracking-[-0.01em] text-foreground">Six instruments. One standard.</h2>
          </div>
          <div data-reveal className="grid grid-cols-1 gap-px overflow-hidden rounded-[18px] border border-border bg-border md:grid-cols-2">
            {FEATURES.map((f, i) => (
              <div
                key={f.n}
                data-reveal
                data-reveal-delay={`${i * 60}`}
                className="lift bg-card p-9 transition-transform duration-200 hover:scale-[1.01]"
              >
                <div className="font-mono text-[12px] tracking-[0.1em] text-[#93702C]">{f.n}</div>
                <h3 className="mt-4 font-display text-[25px] font-medium text-foreground">{f.title}</h3>
                <p className="mt-2.5 text-[14.5px] leading-[1.62] text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ANALYTICS SHOWCASE ═══ */}
      <section id="analytics" className="border-y border-border bg-secondary">
        <div data-reveal className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-14 px-8 py-24 md:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#93702C]">Know what you own</div>
            <h2 className="mt-4 font-display text-[clamp(30px,3.8vw,44px)] font-medium leading-[1.1] text-foreground">
              Two ETFs can hide the same ten stocks. Aureus shows you.
            </h2>
            <p className="mt-[18px] text-[16.5px] leading-[1.65] text-muted-foreground">
              Concentration metrics, effective holdings and full look-through — so overlap and hidden risk surface before they cost you.
            </p>
            <div className="mt-8 flex gap-10">
              <div>
                <div className="font-display text-[38px] text-[#93702C]">74.8%</div>
                <div className="mt-1 text-[13px] text-muted-foreground">in top 3 positions</div>
              </div>
              <div>
                <div className="font-display text-[38px] text-[#93702C]">4.2</div>
                <div className="mt-1 text-[13px] text-muted-foreground">effective holdings</div>
              </div>
            </div>
          </div>
          <div className="rounded-[20px] border border-border bg-card p-[30px] shadow-[0_12px_40px_rgba(80,70,45,0.06)]">
            <div className="mb-5 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Geographic · look-through</div>
            <div className="flex flex-col gap-3.5">
              {GEO.map((g) => (
                <div key={g.label}>
                  <div className="mb-1.5 flex justify-between text-[14px] text-foreground">
                    <span>{g.label}</span>
                    <span className="text-muted-foreground">{g.pct}%</span>
                  </div>
                  <div className="h-[7px] rounded-[4px] bg-[var(--hair)]">
                    <div className="h-full rounded-[4px] bg-[#C6A96A]" style={{ width: `${g.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ QUOTE ═══ */}
      <section className="bg-background">
        <div data-reveal className="mx-auto max-w-[900px] px-8 py-24 text-center">
          <div className="font-display text-[40px] leading-[0.5] text-[#B99640]">&ldquo;</div>
          <p className="mt-5 font-display text-[clamp(24px,3.2vw,32px)] font-light leading-[1.4] text-foreground">
            I stopped keeping three spreadsheets. Aureus tells me my net worth, my drift and my savings rate in one glance — the first finance tool that actually feels calm.
          </p>
          <div className="mt-7 font-mono text-[13px] uppercase tracking-[0.08em] text-faint">Rui — software engineer, Singapore</div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="bg-background">
        <div className="mx-auto max-w-[1240px] px-8 pb-24">
          <div data-reveal className="relative overflow-hidden rounded-[24px] border border-border bg-secondary p-[76px] text-center">
            <Image
              src="/aureus/roman-1.png"
              alt=""
              fill
              className="object-cover opacity-[0.10]"
              style={{ filter: 'grayscale(1) contrast(0.96) brightness(1.3)' }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_50%_0%,rgba(198,169,106,0.22),transparent),hsl(var(--background)/0.72)]" />
            <div className="relative">
              <Image src={logoSrc} alt="Aureus" width={64} height={64} className="mx-auto mb-[22px] block drop-shadow-2xl" />
              <h2 className="font-display text-[clamp(34px,4.6vw,52px)] font-medium leading-[1.05] text-foreground">Your capital deserves a mint.</h2>
              <p className="mx-auto mt-4 max-w-[460px] text-[17px] text-muted-foreground">Join Aureus and see your whole financial life, struck as one.</p>
              <a href="/login" className="mt-[30px] inline-block rounded-[12px] bg-gradient-to-br from-[#E4CE9A] to-[#C6A96A] px-[30px] py-3.5 text-[15px] font-semibold text-[#14140F] transition-all press">
                Claim your account →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-border bg-secondary">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-4 px-8 py-11 text-faint">
          <div className="flex items-center gap-2.5">
            <Image src={logoSrc} alt="Aureus" width={28} height={28} className="block h-[28px] w-auto" />
            <span className="font-display text-[17px] text-foreground">Aureus</span>
          </div>
          <div className="ml-8 flex gap-6 text-[13px]">
            <a href="#features" className="transition-colors hover:text-foreground">Product</a>
            <a href="#analytics" className="transition-colors hover:text-foreground">Analytics</a>
            <a href="#" className="transition-colors hover:text-foreground">Privacy</a>
            <a href="#" className="transition-colors hover:text-foreground">Security</a>
          </div>
          <span className="ml-auto font-mono text-[12px] text-faint">© MMXXVI Aureus · Made in Singapore</span>
        </div>
      </footer>
    </div>
  )
}

function ScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const handler = () => {
      const scrollH = document.documentElement.scrollHeight - window.innerHeight
      setProgress(scrollH > 0 ? (window.scrollY / scrollH) * 100 : 0)
    }
    handler()
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <div className="fixed left-0 right-0 top-0 z-[60] h-[2px] bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-[#C6A96A] to-[#93702C] transition-[width] duration-100 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
