'use client'
import { useEffect, useRef } from 'react'

type SeqMap = Record<string, string>
export interface SeqState { buffer: string[]; at: number }
const WINDOW = 1500

// Pure reducer: advance the key buffer with `key` pressed at `now`. Returns the
// next state, plus `match` (the mapped value) when a full sequence completes.
export function advanceSequence(
  prev: SeqState, key: string, now: number, seqs: SeqMap,
): SeqState & { match?: string } {
  const buffer = now - prev.at > WINDOW ? [key] : [...prev.buffer, key]
  const joined = buffer.join(' ')
  if (seqs[joined]) return { buffer: [], at: now, match: seqs[joined] }
  const stillPossible = Object.keys(seqs).some((k) => k.startsWith(joined))
  return { buffer: stillPossible ? buffer : [key], at: now }
}

const editable = (el: EventTarget | null) => {
  const n = el as HTMLElement | null
  return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable)
}

// Binds go-to sequences (e.g. "g h") to keydown. `onMatch` receives the mapped
// value (a route href). Ignores modifier chords and typing in form fields.
export function useKeySequences(seqs: SeqMap, onMatch: (value: string) => void) {
  const state = useRef<SeqState>({ buffer: [], at: 0 })
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || editable(e.target)) return
      if (e.key.length !== 1) return
      const next = advanceSequence(state.current, e.key.toLowerCase(), Date.now(), seqs)
      state.current = { buffer: next.buffer, at: next.at }
      if (next.match) { e.preventDefault(); onMatch(next.match) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [seqs, onMatch])
}
