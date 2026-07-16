// Splits net worth into liquid (accessible now) vs locked (money you can't
// withdraw until a date — endowment/savings plans, locked funds, ILP lock-in,
// CPF/SRS retirement) and builds an "unlocks on" timeline. Pure — the context
// supplies already-converted base-currency values.

export interface LockCandidate {
  name: string
  valueBase: number
  lockedUntil: string | null   // YYYY-MM-DD, or null
  alwaysLocked?: boolean        // e.g. CPF (locked until retirement, no explicit date)
  source: 'holding' | 'asset' | 'policy'
}

export interface LockedItem {
  name: string
  valueBase: number
  unlockDate: string | null
  source: 'holding' | 'asset' | 'policy'
}

export interface LiquidityBreakdown {
  lockedBase: number
  liquidBase: number            // netWorthBase - lockedBase
  items: LockedItem[]           // locked items, soonest unlock first (undated last)
}

// Is `lockedUntil` still in the future relative to `today`?
export function isLockedNow(lockedUntil: string | null | undefined, today: string): boolean {
  if (!lockedUntil) return false
  const end = Date.parse(lockedUntil)
  const now = Date.parse(today)
  if (isNaN(end) || isNaN(now)) return false
  return end > now
}

export function computeLiquidity(
  netWorthBase: number,
  today: string,
  candidates: LockCandidate[],
): LiquidityBreakdown {
  const items: LockedItem[] = []
  let lockedBase = 0
  for (const c of candidates) {
    const locked = c.alwaysLocked || isLockedNow(c.lockedUntil, today)
    if (!locked || c.valueBase <= 0) continue
    lockedBase += c.valueBase
    items.push({ name: c.name, valueBase: c.valueBase, unlockDate: c.lockedUntil ?? null, source: c.source })
  }
  // Soonest unlock first; undated (e.g. CPF) sorts to the end.
  items.sort((a, b) => {
    if (a.unlockDate && b.unlockDate) return a.unlockDate.localeCompare(b.unlockDate)
    if (a.unlockDate) return -1
    if (b.unlockDate) return 1
    return b.valueBase - a.valueBase
  })
  return { lockedBase, liquidBase: netWorthBase - lockedBase, items }
}
