'use client'

import { useMemo } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { convertToBase } from '@/lib/calculations'
import { formatCurrency } from '@/lib/utils'
import { PageShell } from '@/components/ui/page-shell'
import { SubNav } from '@/components/ui/sub-nav'
import { SUB_NAVS } from '@/lib/nav-registry'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
import { AccountsCard } from '@/components/spending/AccountsCard'
import type { Currency } from '@/types'

export default function AccountsPage() {
  const {
    settings, accounts, accountsNetBase, totalCashBase, accountsError, fxRates,
    addAccount, updateAccount, deleteAccount,
  } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const creditOwedBase = useMemo(() => {
    if (!fxRates) return 0
    return accounts
      .filter((a) => a.type === 'credit')
      .reduce((s, a) => s + convertToBase(Number(a.current_balance) || 0, a.currency, fxRates), 0)
  }, [accounts, fxRates])

  const currencyCount = new Set(accounts.map((a) => String(a.currency))).size

  return (
    <PageShell
      screen="Money" title="Accounts"
      statusRight={<span>{accounts.length} account{accounts.length === 1 ? '' : 's'} · {currencyCount} currenc{currencyCount === 1 ? 'y' : 'ies'}</span>}
      footerHints={<span><span className="text-accent">▸</span> <span className="text-foreground">g s</span> spending · <span className="text-foreground">g h</span> home</span>}
    >
    <div className="space-y-4">
      <SubNav links={[...SUB_NAVS.accounts]} />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            label="Across all accounts"
            value={accountsNetBase}
            format={(n) => formatCurrency(n, base)}
            sub="credit balances subtracted"
          />
          <HeroMetric
            label="Investable cash"
            value={totalCashBase}
            format={(n) => formatCurrency(n, base)}
            sub="cash-type accounts · feeds the rebalancer"
          />
          <HeroMetric
            label="Credit owed"
            value={creditOwedBase}
            format={(n) => formatCurrency(n, base)}
            delta={creditOwedBase > 0 ? [<span key="c" className="text-down">outstanding</span>] : [<span key="c" className="text-up">nothing owed</span>]}
          />
        </HeroBand>
      </div>

      <AccountsCard
        accounts={accounts} netBase={accountsNetBase} base={base} fxRates={fxRates}
        loadError={accountsError} onAdd={addAccount} onUpdate={updateAccount} onDelete={deleteAccount}
      />

      <p className="text-xs text-muted-foreground">
        Click any account for its balance history, monthly in/out, and recent activity.
        Accounts can hold different currencies — everything converts to {base} for the totals above.
      </p>
    </div>
    </PageShell>
  )
}
