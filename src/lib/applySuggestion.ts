import type { PlannedPosition } from '@/lib/planner'
import type { SuggestionApply } from '@/lib/suggestions'
import type { EnrichedHolding, Currency } from '@/types'
import { defaultPlannerTotalValue } from '@/lib/planner'

const PLANNER_KEY = 'planner-state-v1'

interface PlannerState {
  positions: PlannedPosition[]
  totalValue: number
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function loadPlanner(): PlannerState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(PLANNER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.positions)) return null
    return parsed
  } catch { return null }
}

function savePlanner(state: PlannerState) {
  if (typeof window === 'undefined') return
  localStorage.setItem(PLANNER_KEY, JSON.stringify(state))
}

// Seed a fresh planner from the user's actual portfolio.
function seedFromCurrent(currentEnriched: EnrichedHolding[], baseCurrency: Currency): PlannerState {
  const totalValue = currentEnriched.reduce((s, h) => s + h.currentValueBase, 0)
  const positions: PlannedPosition[] = totalValue > 0
    ? currentEnriched.map((h) => ({
        id: newId(),
        ticker: h.ticker,
        name: h.name ?? '',
        pct: parseFloat(((h.currentValueBase / totalValue) * 100).toFixed(2)),
      }))
    : []
  return {
    positions,
    totalValue: Math.round(totalValue) || defaultPlannerTotalValue(0, baseCurrency),
  }
}

// Apply a mutation to a planner state, with auto-rebalancing of the other
// positions so totals still sum to ~100%.
export function applyMutation(state: PlannerState, mutation: SuggestionApply): PlannerState {
  const ticker = mutation.ticker.toUpperCase().trim()
  const positions = [...state.positions]
  const idx = positions.findIndex((p) => p.ticker.toUpperCase() === ticker)

  switch (mutation.kind) {
    case 'set': {
      const targetPct = Math.max(0, mutation.pct)
      const oldPct = idx >= 0 ? positions[idx].pct : 0
      if (idx >= 0) positions[idx] = { ...positions[idx], pct: targetPct }
      else positions.push({ id: newId(), ticker, name: '', pct: targetPct })
      // Distribute the freed/required pct across remaining positions proportionally
      redistribute(positions, ticker, targetPct - oldPct)
      break
    }
    case 'delta': {
      const oldPct = idx >= 0 ? positions[idx].pct : 0
      const newPct = Math.max(0, oldPct + mutation.deltaPct)
      if (idx >= 0) positions[idx] = { ...positions[idx], pct: newPct }
      else if (newPct > 0) positions.push({ id: newId(), ticker, name: '', pct: newPct })
      redistribute(positions, ticker, newPct - oldPct)
      break
    }
    case 'add': {
      // If ticker already present, just bump it; else add and shrink the rest
      if (idx >= 0) {
        const oldPct = positions[idx].pct
        const targetPct = Math.max(oldPct, mutation.pct)
        positions[idx] = { ...positions[idx], pct: targetPct }
        redistribute(positions, ticker, targetPct - oldPct)
      } else {
        positions.push({ id: newId(), ticker, name: '', pct: mutation.pct })
        redistribute(positions, ticker, mutation.pct)
      }
      break
    }
    case 'remove': {
      if (idx >= 0) {
        const removed = positions[idx].pct
        positions.splice(idx, 1)
        // Distribute the removed weight across remaining positions
        const others = positions.filter((p) => p.pct > 0)
        const sumOthers = others.reduce((s, p) => s + p.pct, 0)
        if (sumOthers > 0) {
          for (const p of positions) {
            p.pct = parseFloat((p.pct + (p.pct / sumOthers) * removed).toFixed(2))
          }
        }
      }
      break
    }
  }

  return { ...state, positions }
}

// Adjust other positions so totals stay near 100%. `delta` is the change
// applied to `lockedTicker`; we redistribute -delta across the others
// proportional to their current weights.
function redistribute(positions: PlannedPosition[], lockedTicker: string, delta: number) {
  const others = positions.filter((p) => p.ticker.toUpperCase() !== lockedTicker.toUpperCase() && p.pct > 0)
  const sumOthers = others.reduce((s, p) => s + p.pct, 0)
  if (sumOthers <= 0) return
  // Don't let any go negative
  for (const p of others) {
    const share = p.pct / sumOthers
    const newPct = Math.max(0, p.pct - delta * share)
    p.pct = parseFloat(newPct.toFixed(2))
  }
}

// Public entry: apply a suggestion's mutation and persist. If no planner
// exists yet, seed it from the current portfolio first.
export function applySuggestionToPlanner(
  mutation: SuggestionApply,
  currentEnriched: EnrichedHolding[],
  baseCurrency: Currency,
): { applied: boolean } {
  const existing = loadPlanner()
  const state = existing && existing.positions.length > 0
    ? existing
    : seedFromCurrent(currentEnriched, baseCurrency)
  const next = applyMutation(state, mutation)
  savePlanner(next)
  return { applied: true }
}
