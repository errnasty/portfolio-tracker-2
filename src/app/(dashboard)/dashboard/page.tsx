'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { formatCurrency, formatPercent, gainLossColor } from '@/lib/utils'
import { SectionLabel } from '@/components/ui/section-label'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, Upload } from 'lucide-react'
import type { Currency } from '@/types'

const PCT = (n: number) => `${n.toFixed(1)}%`

export default function DashboardPage() {
  const {
    stats, enriched, loading, refreshPrices, settings, targets,
    accounts, totalCashBase, accountsNetBase, netWorthBase, fxRates,
  } = usePortfolio()
  const {
    spendingStats, bankTransactions, categoryById, budgets, subscriptionSummary, loading: spendingLoading,
  } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const holdingsValue = stats?.holdingsValue ?? 0
  const invested = stats?.totalValue ?? 0
  const income = spendingStats.income
  const expense = spendingStats.expense
  const net = spendingStats.net
  const savingsRate = income > 0 ? (net / income) * 100 : 0
  const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0)

  // ── derived signals for the action queue ────────────────────────────────
  const spentByCat = useMemo(
    () => new Map(spendingStats.byCategory.map((c) => [c.category_id, c.amount])),
    [spendingStats],
  )
  const drift = useMemo(() => {
    const totalEq = enriched.reduce((s, h) => s + h.currentValueBase, 0)
    if (totalEq <= 0) return [] as { ticker: string; cur: number; target: number; d: number }[]
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

  type Action = { sev: 'high' | 'med' | 'low'; tag: string; title: string; sub: string; href: string; cta: string }
  const actions: Action[] = []
  if (drift.length > 0) {
    const top = drift[0]
    actions.push({ sev: 'high', tag: 'REBALANCE', href: '/rebalancer', cta: 'EXECUTE',
      title: `${top.ticker} ${PCT(top.cur)} / target ${PCT(top.target)}`,
      sub: `${top.d > 0 ? 'Overweight' : 'Underweight'} by ${PCT(Math.abs(top.d))}${drift.length > 1 ? ` · +${drift.length - 1} more out of band` : ''}.` })
  }
  if (uncategorized.length > 0) {
    const sum = uncategorized.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    actions.push({ sev: 'high', tag: 'CATEGORIZE', href: '/spending', cta: 'REVIEW',
      title: `${uncategorized.length} uncategorized · ${formatCurrency(sum, base)}`, sub: 'Tag these so budgets and trends stay accurate.' })
  }
  if (subscriptionSummary.potentialMonthly > 0) {
    actions.push({ sev: 'med', tag: 'SUBSCRIPTIONS', href: '/subscriptions', cta: 'CUT',
      title: `${formatCurrency(subscriptionSummary.potentialMonthly * 12, base)}/yr flagged to cut`, sub: 'Review subscriptions marked "could cancel".' })
  }
  if (overBudget.length > 0) {
    actions.push({ sev: 'med', tag: 'BUDGET', href: '/budgets', cta: 'ADJUST',
      title: `${overBudget.length} categor${overBudget.length === 1 ? 'y' : 'ies'} over budget`, sub: overBudget.map((o) => o.name).slice(0, 3).join(' · ') })
  }

  const recent = bankTransactions.slice(0, 8)
  const cashAccounts = accounts.filter((a) => a.type === 'cash')
  const topHoldings = [...enriched].sort((a, b) => b.currentValueBase - a.currentValueBase).slice(0, 6)
  const topCats = spendingStats.byCategory.slice(0, 6)
  const budgetRows = budgets
    .map((b) => ({ name: categoryById[b.category_id]?.name ?? '—', spent: spentByCat.get(b.category_id) ?? 0, limit: Number(b.amount) }))
    .filter((x) => x.limit > 0).slice(0, 6)

  const fxLine = fxRates ? Object.entries(fxRates.rates).filter(([k]) => k !== fxRates.base).slice(0, 2)
    .map(([k, v]) => `${fxRates.base}/${k} ${Number(v).toFixed(3)}`).join(' · ') : '—'

  const sevColor = (s: Action['sev']) => s === 'high' ? 'border-l-[#ff7a59]' : s === 'med' ? 'border-l-amber-500' : 'border-l-border'
  const sevText = (s: Action['sev']) => s === 'high' ? 'text-[#ff7a59]' : s === 'med' ? 'text-amber-500' : 'text-muted-foreground'

  return (
    <div className="-m-3 sm:-m-4 md:-m-6 lg:-m-8 border border-border rounded-sm overflow-hidden bg-card">

      {/* status bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border bg-background px-4 py-2 text-[11px]">
        <span className="font-bold text-primary">PTRK ▸ home</span>
        <span className="text-muted-foreground">base=<span className="text-foreground">{base}</span></span>
        <span className="text-muted-foreground">FX <span className="text-foreground">{fxLine}</span></span>
        <span className="text-muted-foreground">positions <span className="text-foreground">{enriched.length}</span></span>
        <span className="text-muted-foreground">accounts <span className="text-foreground">{accounts.length}</span></span>
        <span className="ml-auto flex items-center gap-3">
          <Link href="/import" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Upload className="h-3.5 w-3.5" /> import</Link>
          <button onClick={refreshPrices} disabled={loading} className="flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50">
            <RefreshCw className="h-3.5 w-3.5" /> refresh
          </button>
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 border-b border-border">
        <div className="border-b border-r border-border p-4 md:col-span-1 lg:col-span-1 col-span-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">NET_WORTH · {base}</div>
          {loading ? <Skeleton className="mt-2 h-9 w-48" /> : (
            <div className="mt-1 text-3xl md:text-4xl font-bold tabular-nums leading-none">{formatCurrency(netWorthBase, base)}</div>
          )}
          <div className="mt-2.5 flex gap-5 text-[11px]">
            <span><span className="text-muted-foreground">MTD net </span><span className={gainLossColor(net)}>{net >= 0 ? '+' : ''}{formatCurrency(net, base)}</span></span>
            <span><span className="text-muted-foreground">save rate </span><span className={savingsRate >= 0 ? 'text-emerald-400' : 'text-[#ff7a59]'}>{savingsRate.toFixed(0)}%</span></span>
          </div>
        </div>

        <KpiTile label="INVESTED" value={formatCurrency(invested, base)}
          sub={stats ? `${formatPercent(stats.totalGainLossPct)} lifetime` : 'no holdings'}
          subClass={stats ? gainLossColor(stats.totalGainLoss) : 'text-muted-foreground'} loading={loading} href="/holdings" />
        <KpiTile label="CASH" value={formatCurrency(totalCashBase, base)}
          sub={`${cashAccounts.length} acct${cashAccounts.length === 1 ? '' : 's'} · investable`} loading={loading} href="/holdings" />
        <KpiTile label="SPENT_MTD" value={formatCurrency(expense, base)}
          sub={totalBudget > 0 ? `of ${formatCurrency(totalBudget, base)} · ${Math.round((expense / totalBudget) * 100)}%` : 'no budget set'}
          subClass={totalBudget > 0 && expense > totalBudget ? 'text-[#ff7a59]' : 'text-muted-foreground'} loading={spendingLoading} href="/spending" last />
        <KpiTile label="SUBSCRIPTIONS" value={`${formatCurrency(subscriptionSummary.activeMonthly, base)}/mo`}
          sub={subscriptionSummary.potentialMonthly > 0 ? `${formatCurrency(subscriptionSummary.potentialMonthly, base)}/mo to cut` : 'all reviewed'}
          subClass={subscriptionSummary.potentialMonthly > 0 ? 'text-amber-500' : 'text-muted-foreground'} loading={spendingLoading} href="/subscriptions" last />
      </div>

      {/* body: 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_310px]">

        {/* LEFT — action queue + signal log */}
        <aside className="border-b lg:border-b-0 lg:border-r border-border bg-[hsl(225_17%_5%)]">
          <SectionLabel right={`${actions.length} pending`}>ACTION_QUEUE</SectionLabel>
          {actions.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">Nothing needs attention. Clean books.</div>
          ) : actions.map((a, i) => (
            <div key={i} className={`border-b border-l-2 border-border ${sevColor(a.sev)} p-3.5`}>
              <div className={`flex justify-between text-[10px] font-bold tracking-[0.1em] ${sevText(a.sev)}`}>
                <span>{a.sev === 'high' ? '! ' : a.sev === 'med' ? '~ ' : '· '}{a.tag}</span>
              </div>
              <div className="mt-1.5 text-[12.5px] leading-snug">{a.title}</div>
              <div className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{a.sub}</div>
              <Link href={a.href}>
                <button className="mt-2 bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">{a.cta} →</button>
              </Link>
            </div>
          ))}

          <SectionLabel right="recent">SIGNAL_LOG</SectionLabel>
          {recent.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">No activity yet.</div>
          ) : recent.map((t) => {
            const inc = Number(t.amount) >= 0
            return (
              <div key={t.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3.5 py-1.5 text-[11px] odd:bg-white/[0.015]">
                <span className="text-muted-foreground tabular-nums">{t.date.slice(5)}</span>
                <span className="truncate">{t.description}</span>
                <span className={`tabular-nums ${inc ? 'text-emerald-400' : 'text-[#ff7a59]'}`}>{inc ? '+' : ''}{formatCurrency(Number(t.amount), t.currency)}</span>
              </div>
            )
          })}
          <div className="border-t border-border px-3.5 py-2 text-[10px]">
            <Link href="/spending" className="text-muted-foreground underline hover:text-foreground">full log →</Link>
          </div>
        </aside>

        {/* CENTER — budgets + holdings */}
        <main className="border-b lg:border-b-0 lg:border-r border-border min-w-0">
          <SectionLabel tone="cool" right="MTD">BUDGETS</SectionLabel>
          <div className="p-3.5 space-y-2.5">
            {budgetRows.length === 0 ? (
              <div className="text-xs text-muted-foreground">No budgets yet — <Link href="/budgets" className="underline">set limits</Link>.</div>
            ) : budgetRows.map((b) => {
              const pct = b.limit > 0 ? (b.spent / b.limit) * 100 : 0
              const col = pct > 100 ? 'bg-[#ff7a59]' : pct > 80 ? 'bg-amber-500' : 'bg-sky-400'
              return (
                <div key={b.name}>
                  <div className="flex justify-between text-[11px]">
                    <span>{b.name}</span>
                    <span className="tabular-nums text-muted-foreground">{formatCurrency(b.spent, base)} / {formatCurrency(b.limit, base)} · <span className={pct > 100 ? 'text-[#ff7a59]' : 'text-emerald-400'}>{pct.toFixed(0)}%</span></span>
                  </div>
                  <div className="mt-1 h-[5px] bg-muted relative">
                    <div className={`absolute inset-y-0 left-0 ${col}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    <div className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground" style={{ left: '100%' }} />
                  </div>
                </div>
              )
            })}
          </div>

          <SectionLabel right={`${enriched.length} positions`}>HOLDINGS</SectionLabel>
          {topHoldings.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">No holdings. <Link href="/holdings" className="underline">Add a position</Link>.</div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-background text-muted-foreground">
                  <th className="px-3.5 py-2 text-left font-medium text-[10px] tracking-[0.06em]">SYM</th>
                  <th className="px-2 py-2 text-right font-medium text-[10px] tracking-[0.06em]">PX</th>
                  <th className="px-2 py-2 text-right font-medium text-[10px] tracking-[0.06em]">Δ1D</th>
                  <th className="px-2 py-2 text-right font-medium text-[10px] tracking-[0.06em]">VALUE</th>
                  <th className="px-2 py-2 text-right font-medium text-[10px] tracking-[0.06em]">%PORT</th>
                  <th className="px-3.5 py-2 text-right font-medium text-[10px] tracking-[0.06em]">RET</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {topHoldings.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="px-3.5 py-2 font-bold">{h.ticker}<div className="text-[10px] font-normal text-muted-foreground truncate max-w-[120px]">{h.name ?? '—'}</div></td>
                    <td className="px-2 py-2 text-right">{h.currentPrice > 0 ? formatCurrency(h.currentPrice, h.priceCurrency) : '—'}</td>
                    <td className={`px-2 py-2 text-right ${h.currentPrice > 0 ? gainLossColor(h.dayChange) : 'text-muted-foreground'}`}>{h.currentPrice > 0 ? formatPercent(h.dayChangePct) : '—'}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(h.currentValueBase, base)}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">{h.allocationPct.toFixed(1)}%</td>
                    <td className={`px-3.5 py-2 text-right ${gainLossColor(h.gainLoss)}`}>{formatPercent(h.gainLossPct)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td colSpan={6} className="px-3.5 py-2 text-muted-foreground"><Link href="/holdings" className="underline">view all holdings →</Link></td>
                </tr>
              </tbody>
            </table>
          )}

          <SectionLabel tone="cool" right="this month">SPEND_BY_CATEGORY</SectionLabel>
          <div className="p-3.5 space-y-2">
            {topCats.length === 0 ? (
              <div className="text-xs text-muted-foreground">No spending this month.</div>
            ) : topCats.map((c) => {
              const pct = expense > 0 ? (c.amount / expense) * 100 : 0
              return (
                <div key={c.category_id ?? 'uncat'}>
                  <div className="flex justify-between text-[11px]"><span>{c.name}</span><span className="tabular-nums text-muted-foreground">{formatCurrency(c.amount, base)} · {pct.toFixed(0)}%</span></div>
                  <div className="mt-1 h-[5px] bg-muted"><div className="h-full bg-sky-400" style={{ width: `${pct}%` }} /></div>
                </div>
              )
            })}
          </div>
        </main>

        {/* RIGHT — accounts + allocation + subs */}
        <aside className="bg-[hsl(225_17%_5%)]">
          <SectionLabel tone="cool" right={formatCurrency(accountsNetBase, base)}>ACCOUNTS</SectionLabel>
          {accounts.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">No accounts. <Link href="/holdings" className="underline">Add one</Link>.</div>
          ) : accounts.map((a) => (
            <div key={a.id} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border px-3.5 py-2 text-[11px]">
              <div className="min-w-0"><div className="truncate">{a.name}</div><div className="text-[10px] text-muted-foreground">{a.institution || a.type} · {a.currency}</div></div>
              <div className={`tabular-nums self-center font-medium ${a.type === 'credit' && Number(a.current_balance) > 0 ? 'text-[#ff7a59]' : ''}`}>
                {a.type === 'credit' && Number(a.current_balance) > 0 ? '-' : ''}{formatCurrency(Number(a.current_balance), a.currency)}
              </div>
            </div>
          ))}

          <SectionLabel right="% of portfolio">ALLOCATION</SectionLabel>
          <div className="p-3.5 space-y-2">
            {topHoldings.length === 0 ? <div className="text-xs text-muted-foreground">—</div> : (
              <>
                {topHoldings.slice(0, 5).map((h) => (
                  <div key={h.id}>
                    <div className="flex justify-between text-[11px]"><span>{h.ticker}</span><span className="tabular-nums text-muted-foreground">{h.allocationPct.toFixed(1)}%</span></div>
                    <div className="mt-1 h-[5px] bg-muted"><div className="h-full bg-primary" style={{ width: `${h.allocationPct}%` }} /></div>
                  </div>
                ))}
                {totalCashBase > 0 && invested > 0 && (
                  <div>
                    <div className="flex justify-between text-[11px]"><span>Cash</span><span className="tabular-nums text-muted-foreground">{((totalCashBase / invested) * 100).toFixed(1)}%</span></div>
                    <div className="mt-1 h-[5px] bg-muted"><div className="h-full bg-sky-400" style={{ width: `${(totalCashBase / invested) * 100}%` }} /></div>
                  </div>
                )}
              </>
            )}
          </div>

          <SectionLabel tone="cool" right="14d auto-sync">SUBSCRIPTIONS</SectionLabel>
          <div className="grid grid-cols-2 gap-3 p-3.5">
            <Mini label="ACTIVE / MO" value={formatCurrency(subscriptionSummary.activeMonthly, base)} />
            <Mini label="CUT / YR" value={formatCurrency(subscriptionSummary.potentialMonthly * 12, base)} tone="text-amber-500" />
            <Mini label="SAVED / YR" value={formatCurrency(subscriptionSummary.cancelledMonthly * 12, base)} tone="text-emerald-400" />
            <div className="self-end"><Link href="/subscriptions" className="text-[11px] underline text-muted-foreground hover:text-foreground">manage →</Link></div>
          </div>
        </aside>
      </div>

      {/* footer */}
      <div className="flex justify-between border-t border-border bg-background px-4 py-2 text-[11px] text-muted-foreground">
        <span><span className="text-primary">▸</span> portfolio + spending · one console</span>
        <span>base {base}</span>
      </div>
    </div>
  )
}

function KpiTile({
  label, value, sub, subClass, loading, href, last,
}: {
  label: string; value: string; sub: string; subClass?: string; loading: boolean; href?: string; last?: boolean
}) {
  const inner = (
    <div className={`border-b border-border p-4 ${last ? '' : 'md:border-r'} ${href ? 'transition-colors hover:bg-accent/40' : ''}`}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      {loading ? <Skeleton className="mt-2 h-6 w-24" /> : (
        <>
          <div className="mt-1 text-xl font-semibold tabular-nums truncate">{value}</div>
          <div className={`mt-0.5 text-[11px] truncate ${subClass ?? 'text-muted-foreground'}`}>{sub}</div>
        </>
      )}
    </div>
  )
  return href ? <Link href={href} className="block">{inner}</Link> : inner
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
    </div>
  )
}
