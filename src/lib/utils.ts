import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Currency } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, currency: Currency | string, compact = false): string {
  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }
  if (compact && Math.abs(value) >= 1_000_000) {
    opts.notation = 'compact'
    // Both bounds must move together: max < min raises RangeError
    // ("maximumFractionDigits value is out of range").
    opts.minimumFractionDigits = 0
    opts.maximumFractionDigits = 1
  }
  return new Intl.NumberFormat('en-US', opts).format(value)
}

export function formatPercent(value: number, digits = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

export function formatShares(value: number): string {
  return value % 1 === 0 ? value.toString() : value.toFixed(4)
}

export function gainLossColor(value: number): string {
  if (value > 0) return 'text-up'
  if (value < 0) return 'text-down'
  return 'text-muted-foreground'
}

export function gainLossBg(value: number): string {
  if (value > 0) return 'bg-[var(--up-soft)] text-up'
  if (value < 0) return 'bg-down/10 text-down'
  return 'bg-muted text-muted-foreground'
}
