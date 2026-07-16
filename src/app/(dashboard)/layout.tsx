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
                {/* Extra bottom padding on mobile clears the fixed tab bar. */}
                <div key={pathname} className="mx-auto max-w-[1180px] animate-section-in px-6 py-10 pb-[96px] md:px-12 md:py-10 md:pb-10">
                  {children}
                </div>
              </main>
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
