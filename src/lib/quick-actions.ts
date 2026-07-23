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
const SHARED_TEXT_KEY = 'aureus_shared_text'
const SHARE_CHECK_EVENT = 'aureus:share-check'

// PWA share-target plumbing. The /share route receives text shared from another
// app (e.g. a bank SMS) and stashes it here; the globally-mounted QuickAddDialog
// picks it up — on its own mount (cold PWA launch) or on the share-check event
// (app already open). The text is removed once consumed so it never re-opens.
export function stashSharedForPaste(text: string) {
  try { if (text) window.sessionStorage.setItem(SHARED_TEXT_KEY, text) } catch { /* ignore */ }
}

export function consumeSharedText(): string {
  try {
    const v = window.sessionStorage.getItem(SHARED_TEXT_KEY)
    if (v) window.sessionStorage.removeItem(SHARED_TEXT_KEY)
    return v ?? ''
  } catch { return '' }
}

export function dispatchShareCheck() {
  window.dispatchEvent(new Event(SHARE_CHECK_EVENT))
}

export function onShareCheck(handler: () => void): () => void {
  window.addEventListener(SHARE_CHECK_EVENT, handler)
  return () => window.removeEventListener(SHARE_CHECK_EVENT, handler)
}

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
