'use client'

import { ErrorFallback } from '@/components/ErrorFallback'

// Catches errors thrown inside any (dashboard) route. Keeps the sidebar +
// chrome intact — only the page content area shows the fallback.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorFallback error={error} reset={reset} />
}
