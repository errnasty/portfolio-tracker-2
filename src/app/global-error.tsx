'use client'

import { ErrorFallback } from '@/components/ErrorFallback'

// Catches errors thrown by the root layout itself. Must include its own
// <html>/<body> since the root layout has failed.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <ErrorFallback error={error} reset={reset} bare />
      </body>
    </html>
  )
}
