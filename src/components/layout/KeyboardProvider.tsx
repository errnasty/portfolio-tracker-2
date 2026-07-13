'use client'
import { useEffect, useState } from 'react'
import { CommandPalette } from './CommandPalette'
import { useKeySequences } from '@/lib/useKeySequences'
import { NAV_SEQUENCES } from '@/lib/nav-registry'
import { useViewTransitionRouter } from '@/components/motion/ViewTransitionProvider'
import { triggerQuickAction } from '@/lib/quick-actions'

const isEditable = (el: EventTarget | null) => {
  const n = el as HTMLElement | null
  return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable)
}

// Mounts the command palette and global shortcuts: ⌘K / k toggles the palette,
// "g h/s/p/…" jump to routes. Must live inside ViewTransitionProvider.
export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const navigate = useViewTransitionRouter()
  useKeySequences(NAV_SEQUENCES, navigate)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmdK = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)
      const bareK = e.key.toLowerCase() === 'k' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target)
      if (cmdK || bareK) { e.preventDefault(); setOpen((v) => !v) }
      // `a` = quick-add an expense from anywhere.
      const bareA = e.key.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target)
      if (bareA) { e.preventDefault(); triggerQuickAction('add-expense', '/spending', navigate) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  )
}
