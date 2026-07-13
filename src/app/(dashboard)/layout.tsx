'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PortfolioProvider } from '@/context/PortfolioContext'
import { SpendingProvider } from '@/context/SpendingContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { ViewTransitionProvider } from '@/components/motion/ViewTransitionProvider'
import { KeyboardProvider } from '@/components/layout/KeyboardProvider'
import { WhatsNewDialog } from '@/components/layout/WhatsNewDialog'
import { OnboardingTour } from '@/components/layout/OnboardingTour'
import { QuickAddDialog } from '@/components/layout/QuickAddDialog'
import { RecurringPoster } from '@/components/layout/RecurringPoster'
import { dispatchQuickAction } from '@/lib/quick-actions'
import { Plus } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      setChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login')
    })
    return () => subscription.unsubscribe()
  }, [router])

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin-custom rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <PortfolioProvider>
      <SpendingProvider>
        <ViewTransitionProvider>
          <KeyboardProvider>
            <div className="flex min-h-screen bg-background">
              <Sidebar />
              <main className="flex-1 pt-12 md:pl-[250px] md:pt-0">
                <div key={pathname} className="mx-auto max-w-[1180px] animate-section-in px-6 py-10 pb-[72px] md:px-12 md:py-10">
                  {children}
                </div>
              </main>
              <WhatsNewDialog />
              <OnboardingTour />
              <QuickAddDialog />
              <RecurringPoster />
              {/* Mobile quick-entry FAB — two taps to log an expense. */}
              <button
                aria-label="Quick add transaction"
                onClick={() => dispatchQuickAction('add-expense')}
                className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>
          </KeyboardProvider>
        </ViewTransitionProvider>
      </SpendingProvider>
    </PortfolioProvider>
  )
}
