'use client'

import { useEffect } from 'react'

// Registers the offline-fallback service worker (public/sw.js).
// Production only — a SW during dev serves stale bundles and breaks HMR.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => { /* non-fatal */ })
  }, [])
  return null
}
