'use client'

import { useEffect } from 'react'
import { AlertOctagon, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
  // When true, render a minimal layout (used by global-error which doesn't
  // have access to the dashboard chrome).
  bare?: boolean
}

// Reusable fallback UI for Next.js error boundaries. Reports the error to
// /api/log on mount so we get telemetry without blocking render.
export function ErrorFallback({ error, reset, bare = false }: Props) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => { /* never let telemetry break the page */ })
  }, [error])

  const content = (
    <div className="mx-auto max-w-md text-center space-y-4">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
        <AlertOctagon className="h-6 w-6 text-red-400" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          {error.message || 'An unexpected error occurred while rendering this page.'}
        </p>
        {error.digest && (
          <p className="text-[11px] font-mono text-muted-foreground">ref: {error.digest}</p>
        )}
      </div>
      <div className="flex justify-center gap-2 pt-2">
        <Button onClick={reset} size="sm">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
        </Button>
        <Button variant="outline" size="sm" onClick={() => { window.location.href = '/dashboard' }}>
          <Home className="mr-1.5 h-3.5 w-3.5" /> Dashboard
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground pt-4">
        The error has been logged. If it keeps happening, check the browser console for details.
      </p>
    </div>
  )

  if (bare) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        {content}
      </div>
    )
  }
  return <div className="flex min-h-[60vh] items-center justify-center p-4">{content}</div>
}
