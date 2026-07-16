'use client'

import { useEffect } from 'react'

// Quick actions let the command palette (and the global `a` key) open a
// page's add-dialog from anywhere. If the page is already mounted we fire an
// event it's listening for; otherwise we stash the action in sessionStorage,
// navigate, and the page consumes it on mount.

export type QuickActionKind =
  | 'add-expense'
  | 'paste-transaction'
  | 'add-income'
  | 'transfer'
  | 'add-iou'
  | 'add-payment'
  | 'add-holding'
  | 'add-goal'

const EVENT = 'aureus:quick-action'
const PENDING_KEY = 'aureus_pending_quick_action'

// For actions handled by globally-mounted components (e.g. the quick-add
// dialog): fire the event directly, no navigation needed.
export function dispatchQuickAction(kind: QuickActionKind) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: kind }))
}

export function triggerQuickAction(
  kind: QuickActionKind,
  href: string,
  navigate: (href: string) => void,
) {
  if (window.location.pathname === href) {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: kind }))
    return
  }
  try { window.sessionStorage.setItem(PENDING_KEY, kind) } catch { /* ignore */ }
  navigate(href)
}

// Pages call this once per action kind they can handle: consumes a pending
// action left before navigation, and listens for live events while mounted.
export function useQuickAction(kind: QuickActionKind, open: () => void) {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(PENDING_KEY) === kind) {
        window.sessionStorage.removeItem(PENDING_KEY)
        open()
      }
    } catch { /* ignore */ }
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === kind) open()
    }
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [kind, open])
}
