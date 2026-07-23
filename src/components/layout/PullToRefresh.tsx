'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'

const THRESHOLD = 72 // px of pull needed to trigger
const MAX = 110 // px the indicator can travel
const RESISTANCE = 0.5 // finger-to-indicator ratio (rubber-band feel)

// Mobile pull-to-refresh. The body already sets `overscroll-behavior-y: none`,
// which disables the browser's own pull-to-refresh, so this is the only one and
// there's no double-trigger. Only arms when the page is scrolled to the very top
// on a narrow (phone) viewport; desktop never sees it.
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const { refreshPrices, refreshAccounts } = usePortfolio()
  const { refreshBankTransactions } = useSpending()

  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const armed = useRef(false)
  const refreshingRef = useRef(false)

  const onRefresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    haptic('success')
    try {
      await Promise.all([refreshPrices(), refreshAccounts(), refreshBankTransactions()])
    } catch { /* leave stale data in place */ }
    refreshingRef.current = false
    setRefreshing(false)
  }, [refreshPrices, refreshAccounts, refreshBankTransactions])

  useEffect(() => {
    const isPhone = () => window.matchMedia('(max-width: 767px)').matches

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || window.scrollY > 0 || !isPhone() || e.touches.length !== 1) {
        armed.current = false
        return
      }
      startY.current = e.touches[0].clientY
      armed.current = true
    }
    const onMove = (e: TouchEvent) => {
      if (!armed.current || startY.current == null) return
      const dy = e.touches[0].clientY - startY.current
      // If the user scrolled up mid-gesture, or pulls upward, disarm.
      if (dy <= 0 || window.scrollY > 0) { setPull(0); armed.current = false; return }
      setPull(Math.min(MAX, dy * RESISTANCE))
    }
    const onEnd = () => {
      if (armed.current && pull >= THRESHOLD) onRefresh()
      setPull(0)
      armed.current = false
      startY.current = null
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [pull, onRefresh])

  const offset = refreshing ? THRESHOLD : pull
  const visible = refreshing || pull > 4

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center md:hidden"
        style={{
          transform: `translateY(${offset - 4}px)`,
          opacity: visible ? 1 : 0,
          transition: armed.current ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
        }}
        aria-hidden={!refreshing}
      >
        <div className="mt-2 rounded-full border border-border bg-card p-2 shadow-lg">
          <RefreshCw
            className={cn('h-4 w-4 text-accent', refreshing && 'animate-spin-custom')}
            style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
          />
        </div>
      </div>
      {children}
    </>
  )
}
