'use client'

import { ErrorFallback } from '@/components/ErrorFallback'

// Catches errors that escape route-group boundaries (e.g. /login).
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorFallback error={error} reset={reset} bare />
}
