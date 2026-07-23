'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { stashSharedForPaste, dispatchShareCheck } from '@/lib/quick-actions'

// PWA share-target landing route. Another app (e.g. Messages) shares a bank
// SMS/email here; we stash the text, bounce to Spending, and the global
// QuickAddDialog opens paste mode pre-filled. Rendered inside the dashboard
// layout so auth + the dialog are already in the tree.
function ShareHandler() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const combined = [params.get('title'), params.get('text'), params.get('url')]
      .filter(Boolean)
      .join('\n')
      .trim()
    stashSharedForPaste(combined)
    router.replace('/spending')
    // Cover the warm-start case where QuickAddDialog is already mounted.
    requestAnimationFrame(() => dispatchShareCheck())
  }, [params, router])

  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      Opening quick-add…
    </div>
  )
}

export default function SharePage() {
  return (
    <Suspense fallback={null}>
      <ShareHandler />
    </Suspense>
  )
}
