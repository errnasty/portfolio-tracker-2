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
import { CpfPoster } from '@/components/layout/CpfPoster'
import { MobileTabBar } from '@/components/layout/MobileTabBar'
import { PullToRefresh } from '@/components/layout/PullToRefresh'

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
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background">
        <div className="flex flex-col items-center gap-1 animate-fade-in">
          <span className="font-display text-3xl text-foreground">Aureus</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">Private wealth</span>
        </div>
        <div className="h-6 w-6 animate-spin-custom rounded-full border-2 border-primary border-t-transparent" />
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
              <PullToRefresh>
                <main className="min-w-0 flex-1 overflow-x-clip pt-[calc(3rem_+_env(safe-area-inset-top))] md:pl-[250px] md:pt-0">
                  {/* Extra bottom padding on mobile clears the fixed tab bar. */}
                  <div key={pathname} className="mx-auto max-w-[1180px] animate-section-in px-4 py-6 pb-[96px] sm:px-6 md:px-12 md:py-10 md:pb-10">
                    {children}
                  </div>
                </main>
              </PullToRefresh>
              <WhatsNewDialog />
              <OnboardingTour />
              <QuickAddDialog />
              <RecurringPoster />
              <CpfPoster />
              <MobileTabBar />
            </div>
          </KeyboardProvider>
        </ViewTransitionProvider>
      </SpendingProvider>
    </PortfolioProvider>
  )
}
