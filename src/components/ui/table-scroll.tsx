'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  className?: string
  // Add a sticky first column so the ticker stays visible while scrolling
  stickyFirstCol?: boolean
}

// Wrapper that adds (a) a horizontal scroll container, (b) a fade gradient on
// the right edge when the table overflows on mobile, (c) optional sticky
// first column. Detects overflow via ResizeObserver so the affordances toggle
// dynamically as the viewport changes.
export function TableScroll({ children, className, stickyFirstCol = false }: Props) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [hasOverflow, setHasOverflow] = useState(false)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const check = () => setHasOverflow(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    window.addEventListener('resize', check)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [children])

  return (
    <div className={cn(
      'table-scroll',
      stickyFirstCol && 'sticky-first',
      hasOverflow && 'has-overflow',
      className,
    )}>
      <div ref={innerRef} className="table-scroll-inner">
        {children}
      </div>
      {hasOverflow && (
        <div className="md:hidden text-[10px] text-muted-foreground text-right pr-1 pt-1 select-none">
          Swipe →
        </div>
      )}
    </div>
  )
}
