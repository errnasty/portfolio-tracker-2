'use client'
import { useEffect, useRef, useState } from 'react'

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const countUpValue = (from: number, to: number, p: number) =>
  from + (to - from) * easeOutCubic(p)

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Animates `value` from its previous value on change. Returns the current
// display number. Snaps instantly when the user prefers reduced motion.
export function useCountUp(value: number, durationMs = 650): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const raf = useRef<number>()

  useEffect(() => {
    if (prefersReduced() || fromRef.current === value) {
      setDisplay(value)
      fromRef.current = value
      return
    }
    const from = fromRef.current
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      setDisplay(countUpValue(from, value, p))
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [value, durationMs])

  return display
}
