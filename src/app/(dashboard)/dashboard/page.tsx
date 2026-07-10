'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { AreaChart, Area, Line, ComposedChart, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { formatCurrency, formatPercent, gainLossColor } from '@/lib/utils'
import { SectionLabel } from '@/components/ui/section-label'
import { PageShell } from '@/components/ui/page-shell'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
import { ActivityRow } from '@/components/ui/stat-row'
import { RefreshCw, Upload } from 'lucide-react'
import type { Currency } from '@/types'

const PCT = (n: number) => `${n.toFixed(1)}%`

export default function DashboardPage() {
  const {
    stats, enriched, loading, refreshPrices, settings, targets,
    accounts, totalCashBase, accountsNetBase, netWorthBase, netWorthHistory, fxRates,
  } = usePortfolio()
  const {
    spendingStats, bankTransactions, categoryById, budgets, subscriptionSummary,
  } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const holdingsValue = stats?.holdingsValue ?? 0
  const invested = stats?.totalValue ?? 0
  const income = spendingStats.income
  const expense = spendingStats.expense
  const net = spendingStats.net
  const savingsRate = income > 0 ? (net / income) * 100 : 0

  const spentByCat = useMemo(
    () => new Map(spendingStats.byCategory.map((c) => [c.category_id, c.amount])),
    [spendingStats],
  )
  const drift = useMemo(() => {
    const totalEq = enriched.reduce((s, h) => s + h.currentValueBase, 0)
    if (totalEq <= 0) return [] as { ticker: string; cur: number; target: number; d: number; out: boolean }[]
    return targets.map((t) => {
      const h = enriched.find((e) => e.ticker === t.ticker)
      const cur = ((h?.currentValueBase ?? 0) / totalEq) * 100
      const tol = t.tolerance_pct ?? 5
      return { ticker: t.ticker, cur, target: t.target_pct, d: cur - t.target_pct, out: Math.abs(cur - t.target_pct) > tol }
    }).filter((x) => x.out).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
  }, [enriched, targets])

  const uncategorized = useMemo(() => bankTransactions.filter((t) => !t.category_id), [bankTransactions])
  const overBudget = useMemo(() => budgets
    .map((b) => ({ name: categoryById[b.category_id]?.name ?? '—', spent: spentByCat.get(b.category_id) ?? 0, limit: Number(b.amount) }))
    .filter((x) => x.limit > 0 && x.spent > x.limit), [budgets, categoryById, spentByCat])

  type Action = { sev: 'high' | 'med'; tag: string; title: string; sub: string; href: string; cta: string }
  const actions: Action[] = []
  if (drift.length > 0) {
    const top = drift[0]
    actions.push({ sev: 'high', tag: 'REBALANCE', href: '/rebalancer', cta: 'EXECUTE',
      title: `${top.ticker} ${PCT(top.cur)} / target ${PCT(top.target)}`,
      sub: `${top.d > 0 ? 'Overweight' : 'Underweight'} by ${PCT(Math.abs(top.d))}${drift.length > 1 ? ` · +${drift.length - 1} more` : ''}.` })
  }
  if (uncategorized.length > 0) {
    const sum = uncategorized.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    actions.push({ sev: 'high', tag: 'CATEGORIZE', href: '/spending', cta: 'REVIEW',
      title: `${uncategorized.length} uncategorized · ${formatCurrency(sum, base)}`, sub: 'Tag these to keep budgets accurate.' })
  }
  if (subscriptionSummary.potentialMonthly > 0) {
    actions.push({ sev: 'med', tag: 'SUBSCRIPTIONS', href: '/subscriptions', cta: 'CUT',
      title: `${formatCurrency(subscriptionSummary.potentialMonthly * 12, base)}/yr flagged`, sub: 'Review subs marked "could cancel".' })
  }
  if (overBudget.length > 0) {
    actions.push({ sev: 'med', tag: 'BUDGET', href: '/budgets', cta: 'ADJUST',
      title: `${overBudget.length} over budget`, sub: overBudget.map((o) => o.name).slice(0, 3).join(' · ') })
  }
  const topActions = actions.slice(0, 3)

  // net-worth trend (snapshots + live today point)
  const sparkData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const pts = netWorthHistory.map((s) => ({ d: s.date, v: Number(s.net_worth) }))
    if (pts.length && pts[pts.length - 1].d === today) pts[pts.length - 1] = { d: today, v: netWorthBase }
    else if (netWorthBase > 0) pts.push({ d: today, v: netWorthBase })
    return pts
  }, [netWorthHistory, netWorthBase])
  const valAt = (daysAgo: number): number | null => {
    const t = new Date(); t.setDate(t.getDate() - daysAgo)
    const ts = t.toISOString().slice(0, 10)
    const prior = netWorthHistory.filter((s) => s.date <= ts)
    return prior.length ? Number(prior[prior.length - 1].net_worth) : null
  }
  const deltas = ([['1D', 1], ['7D', 7], ['30D', 30]] as const)
    .map(([label, d]) => ({ label, v: valAt(d) }))
    .filter((x) => x.v != null)
    .map((x) => ({ label: x.label, delta: netWorthBase - (x.v as number) }))

  const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0)
  const spentPct = totalBudget > 0 ? Math.min(100, (expense / totalBudget) * 100) : 0

  // Daily spend + cumulative curve for the current month (from bank txns).
  const monthDaily = useMemo(() => {
    const now = new Date()
    const ym = now.toISOString().slice(0, 7)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const todayDay = now.getDate()
    const perDay = new Array(daysInMonth).fill(0)
    for (const t of bankTransactions) {
      if (!t.date.startsWith(ym)) continue
      const amt = Number(t.amount)
      if (amt >= 0) continue
      const day = parseInt(t.date.slice(8, 10), 10)
      if (day >= 1 && day <= daysInMonth) perDay[day - 1] += -amt
    }
    let run = 0
    const curve = perDay.map((v, i) => {
      run += v
      return {
        day: i + 1,
        cum: i + 1 <= todayDay ? Math.round(run * 100) / 100 : null,
        pace: totalBudget > 0 ? Math.round((totalBudget * (i + 1) / daysInMonth) * 100) / 100 : null,
      }
    })
    const maxDay = Math.max(1, ...perDay)
    return { perDay, curve, maxDay, todayDay, daysInMonth }
  }, [bankTransactions, totalBudget])

  const allocHoldings = [...enriched].sort((a, b) => b.currentValueBase - a.currentValueBase).slice(0, 5)
  const topCats = spendingStats.byCategory.slice(0, 6)
  const budgetRows = budgets
    .map((b) => ({ name: categoryById[b.category_id]?.name ?? '—', spent: spentByCat.get(b.category_id) ?? 0, limit: Number(b.amount) }))
    .filter((x) => x.limit > 0).slice(0, 6)

  const fxLine = fxRates ? Object.entries(fxRates.rates).filter(([k]) => k !== fxRates.base).slice(0, 2)
    .map(([k, v]) => `${fxRates.base}/${k} ${Number(v).toFixed(3)}`).join(' · ') : '—'

  // Unified activity feed: lead with the top drift alert, then recent txns. Capped at 6.
  type Act = { tone: 'up' | 'down' | 'cool' | 'warn'; when: string; text: string; amount: React.ReactNode }
  const activity: Act[] = []
  if (drift.length > 0) {
    activity.push({ tone: 'down', when: 'now', text: `${drift[0].ticker} breached rebalance band`, amount: `${drift[0].d >= 0 ? '+' : ''}${PCT(drift[0].d)}` })
  }
  for (const t of bankTransactions.slice(0, 6)) {
    const inc = Number(t.amount) >= 0
    activity.push({
      tone: inc ? 'up' : 'cool',
      when: t.date.slice(5),
      text: t.description,
      amount: <span className={inc ? 'text-up' : 'text-down'}>{inc ? '+' : ''}{formatCurrency(Number(t.amount), t.currency)}</span>,
    })
  }
  const feed = activity.slice(0, 6)

  const sevColor = (s: Action['sev']) => s === 'high' ? 'border-l-down' : 'border-l-warn'
  const sevText = (s: Action['sev']) => s === 'high' ? 'text-down' : 'text-warn'

  const statusRight = (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span>base=<span className="text-foreground">{base}</span></span>
      <span className="hidden sm:inline">FX <span className="text-foreground">{fxLine}</span></span>
      <span>positions <span className="text-foreground">{enriched.length}</span></span>
      <Link href="/import" className="flex items-center gap-1 hover:text-foreground"><Upload className="h-3.5 w-3.5" /> import</Link>
      <button onClick={refreshPrices} disabled={loading} className="press flex items-center gap-1 hover:text-foreground disabled:opacity-50">
        <RefreshCw className="h-3.5 w-3.5" /> refresh
      </button>
    </span>
  )

  const footerHints = (
    <>
      <span>
        <span className="text-[var(--accent)]">▸</span>{' '}
        <span className="text-foreground">g s</span> spending ·{' '}
        <span className="text-foreground">g o</span> holdings ·{' '}
        <span className="text-foreground">g b</span> budgets ·{' '}
        <span className="text-foreground">g p</span> planner
      </span>
    </>
  )

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night'

  return (
    <PageShell screen="Overview" title={greeting} statusRight={statusRight} footerHints={footerHints}>
      <div className="space-y-4">

        {/* ── Console card: hero + attention + activity ──────────────────── */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <HeroBand>
            <HeroMetric
              big
              vtName="hero-net-worth"
              label={`Net worth · ${base}`}
              value={netWorthBase}
              format={(n) => formatCurrency(n, base)}
              delta={deltas.map((x) => (
                <span key={x.label}><span className="text-muted-foreground">{x.label} </span><span className={gainLossColor(x.delta)}>{x.delta >= 0 ? '+' : ''}{formatCurrency(x.delta, base)}</span></span>
              ))}
            >
              {sparkData.length >= 2 && (
                <div className="mt-5 h-11 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                      <defs>
                        <linearGradient id="nwSpark" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#C6A96A" stopOpacity={0.32} />
                          <stop offset="100%" stopColor="#C6A96A" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="v" stroke="#C6A96A" strokeWidth={1.4} fill="url(#nwSpark)" isAnimationActive={false} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </HeroMetric>

            <HeroMetric
              label="Invested"
              value={holdingsValue}
              format={(n) => formatCurrency(n, base)}
              delta={stats ? [<span key="l" className={gainLossColor(stats.totalGainLoss)}>{formatPercent(stats.totalGainLossPct)} lifetime</span>] : undefined}
              sub={`Cash ${formatCurrency(totalCashBase, base)}`}
            />

            <HeroMetric
              label="Spent this month"
              value={expense}
              format={(n) => formatCurrency(n, base)}
              sub={totalBudget > 0 ? <>of {formatCurrency(totalBudget, base)} budget</> : undefined}
            >
              <div className="mt-3 h-1.5 overflow-hidden rounded-[1px] bg-[var(--hair)]">
                <div className={spentPct >= 100 ? 'h-full bg-down' : 'h-full bg-cool'} style={{ width: `${spentPct}%`, transition: 'width 0.6s cubic-bezier(0.2,0.7,0.3,1)' }} />
              </div>
              <div className="mt-3 flex justify-between text-xs">
                <span className="text-muted-foreground">saved this month</span>
                <span className={`font-semibold tabular-nums ${gainLossColor(net)}`}>{net >= 0 ? '+' : ''}{formatCurrency(net, base)} · {savingsRate.toFixed(0)}%</span>
              </div>
            </HeroMetric>
          </HeroBand>

          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Needs attention — capped at 3 */}
            <div className="border-b border-border lg:border-b-0 lg:border-r">
              <SectionLabel right={topActions.length ? `${topActions.length} of ${actions.length}` : 'clear'}>NEEDS YOUR ATTENTION</SectionLabel>
              {topActions.length === 0 ? (
                <div className="p-5 text-xs text-muted-foreground">Nothing needs attention. Clean books.</div>
              ) : topActions.map((a, i) => (
                <div key={i} className={`border-b border-l-2 border-border ${sevColor(a.sev)} p-4 last:border-b-0`}>
                  <div className={`text-[10px] font-bold tracking-[0.14em] ${sevText(a.sev)}`}>{a.sev === 'high' ? '! ' : '~ '}{a.tag}</div>
                  <div className="font-sans mt-2 text-[15px] leading-snug text-foreground">{a.title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.sub}</div>
                  <Link href={a.href}>
                    <button className="press mt-3 rounded-sm bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent-text)] hover:bg-[var(--accent)]/90">{a.cta} →</button>
                  </Link>
                </div>
              ))}
            </div>

            {/* Activity — last events, capped at 6 */}
            <div>
              <SectionLabel tone="cool" right="last events">ACTIVITY</SectionLabel>
              {feed.length === 0 ? (
                <div className="p-5 text-xs text-muted-foreground">No recent activity.</div>
              ) : feed.map((a, i) => (
                <ActivityRow key={i} tone={a.tone} when={a.when} text={a.text} amount={a.amount} />
              ))}
              <div className="flex items-center justify-between border-t border-border px-5 py-2.5 text-[11px]">
                <span className="text-muted-foreground"><span className="text-up">●</span> income <span className="text-down">●</span> alert <span className="text-sky-400">●</span> spend</span>
                <Link href="/spending" className="text-muted-foreground underline hover:text-foreground">all activity →</Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── DETAILS (below the fold) ──────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

          {topCats.length > 0 && (
            <Panel label="SPEND_BY_CATEGORY" tone="cool" right="this month" href="/spending">
              <div className="space-y-2 p-3.5">
                {topCats.map((c) => {
                  const pct = expense > 0 ? (c.amount / expense) * 100 : 0
                  return (
                    <div key={c.category_id ?? 'uncat'}>
                      <div className="flex justify-between text-[11px]"><span className="truncate">{c.name}</span><span className="whitespace-nowrap tabular-nums text-muted-foreground">{formatCurrency(c.amount, base)} · {pct.toFixed(0)}%</span></div>
                      <div className="mt-1 h-[5px] bg-[var(--hair)]"><div className="h-full bg-cool" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )
                })}
              </div>
            </Panel>
          )}

          {bankTransactions.length > 0 && (
            <Panel label="SPEND_CURVE" tone="cool" right="MTD vs pace" href="/spending" className="md:col-span-2">
              <div className="p-3.5">
                <ResponsiveContainer width="100%" height={120}>
                  <ComposedChart data={monthDaily.curve} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="spendCum" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3f6fb0" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3f6fb0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} interval={6} />
                    <Tooltip
                      formatter={(v, n) => [formatCurrency(Number(v), base), n === 'cum' ? 'Spent' : 'Budget pace']}
                      labelFormatter={(d) => `Day ${d}`}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }}
                    />
                    {totalBudget > 0 && <Line type="monotone" dataKey="pace" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />}
                    <Area type="monotone" dataKey="cum" stroke="#3f6fb0" strokeWidth={1.4} fill="url(#spendCum)" connectNulls dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="mt-3 flex flex-wrap gap-[3px]">
                  {monthDaily.perDay.map((v, i) => {
                    const intensity = v > 0 ? 0.18 + 0.82 * (v / monthDaily.maxDay) : 0.06
                    const isToday = i + 1 === monthDaily.todayDay
                    return (
                      <div
                        key={i}
                        title={`Day ${i + 1} · ${formatCurrency(v, base)}`}
                        className="h-3.5 w-3.5 rounded-[1px]"
                        style={{ backgroundColor: `rgba(63,111,176,${intensity})`, outline: isToday ? '1px solid hsl(var(--primary))' : 'none' }}
                      />
                    )
                  })}
                </div>
                <div className="mt-1.5 flex justify-between text-[9px] text-muted-foreground"><span>day 1</span><span>today · day {monthDaily.todayDay}</span></div>
              </div>
            </Panel>
          )}

          {accounts.length > 0 && (
            <Panel label="ACCOUNTS" tone="cool" right={formatCurrency(accountsNetBase, base)} href="/spending">
              <div>
                {accounts.map((a) => (
                  <div key={a.id} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border px-3.5 py-2 text-[11px] last:border-0">
                    <div className="min-w-0"><div className="truncate">{a.name}</div><div className="truncate text-[10px] text-muted-foreground">{a.institution || a.type} · {a.currency}</div></div>
                    <div className={`self-center whitespace-nowrap font-medium tabular-nums ${a.type === 'credit' && Number(a.current_balance) > 0 ? 'text-down' : ''}`}>
                      {a.type === 'credit' && Number(a.current_balance) > 0 ? '-' : ''}{formatCurrency(Number(a.current_balance), a.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {allocHoldings.length > 0 && (
            <Panel label="ALLOCATION" right="% of portfolio" href="/analytics">
              <div className="space-y-2 p-3.5">
                {allocHoldings.map((h) => (
                  <div key={h.id}>
                    <div className="flex justify-between text-[11px]"><span>{h.ticker}</span><span className="tabular-nums text-muted-foreground">{h.allocationPct.toFixed(1)}%</span></div>
                    <div className="mt-1 h-[5px] bg-[var(--hair)]"><div className="h-full bg-[var(--accent)]" style={{ transition: "width 0.6s cubic-bezier(0.2,0.7,0.3,1)", width: `${h.allocationPct}%` }} /></div>
                  </div>
                ))}
                {totalCashBase > 0 && invested > 0 && (
                  <div>
                    <div className="flex justify-between text-[11px]"><span>Cash</span><span className="tabular-nums text-muted-foreground">{((totalCashBase / invested) * 100).toFixed(1)}%</span></div>
                    <div className="mt-1 h-[5px] bg-[var(--hair)]"><div className="h-full bg-cool" style={{ width: `${(totalCashBase / invested) * 100}%` }} /></div>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {budgetRows.length > 0 && (
            <Panel label="BUDGETS" tone="cool" right="MTD" href="/budgets">
              <div className="space-y-2.5 p-3.5">
                {budgetRows.map((b) => {
                  const pct = b.limit > 0 ? (b.spent / b.limit) * 100 : 0
                  const col = pct > 100 ? 'bg-down' : pct > 80 ? 'bg-warn' : 'bg-cool'
                  return (
                    <div key={b.name}>
                      <div className="flex justify-between text-[11px]"><span className="truncate">{b.name}</span><span className="whitespace-nowrap tabular-nums text-muted-foreground">{formatCurrency(b.spent, base)} / {formatCurrency(b.limit, base)}</span></div>
                      <div className="relative mt-1 h-[5px] bg-[var(--hair)]">
                        <div className={`absolute inset-y-0 left-0 ${col}`} style={{ width: `${Math.min(100, pct)}%` }} />
                        <div className="absolute -bottom-0.5 -top-0.5 w-px bg-foreground" style={{ left: '100%' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>
          )}

          <Panel label="SUBSCRIPTIONS" tone="cool" right="14d auto-sync" href="/subscriptions">
            <div className="grid grid-cols-3 gap-3 p-3.5">
              <Mini label="ACTIVE / MO" value={formatCurrency(subscriptionSummary.activeMonthly, base)} />
              <Mini label="CUT / YR" value={formatCurrency(subscriptionSummary.potentialMonthly * 12, base)} tone="text-warn" />
              <Mini label="SAVED / YR" value={formatCurrency(subscriptionSummary.cancelledMonthly * 12, base)} tone="text-up" />
            </div>
            <div className="border-t border-border px-3.5 py-2 text-[10px]"><Link href="/subscriptions" className="text-muted-foreground underline hover:text-foreground">manage →</Link></div>
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}

function Panel({
  label, right, tone, href, className, children,
}: {
  label: string; right?: React.ReactNode; tone?: 'accent' | 'cool' | 'mute'; href?: string; className?: string; children: React.ReactNode
}) {
  return (
    <div className={`lift overflow-hidden rounded-lg border border-border bg-card ${className ?? ''}`}>
      <SectionLabel tone={tone} right={right} href={href}>{label}</SectionLabel>
      {children}
    </div>
  )
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className={`truncate text-sm font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
    </div>
  )
}
