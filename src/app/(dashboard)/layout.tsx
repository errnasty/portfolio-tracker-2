'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PortfolioProvider } from '@/context/PortfolioContext'
import { SpendingProvider } from '@/context/SpendingContext'
import { Sidebar } from '@/components/layout/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <PortfolioProvider>
      <SpendingProvider>
        <div className="flex min-h-screen bg-background">
          <Sidebar />
          <main className="flex-1 pt-12 md:pt-0 md:pl-56">
            <div className="mx-auto max-w-7xl p-3 sm:p-4 md:p-6 lg:p-8">
              {children}
            </div>
          </main>
        </div>
      </SpendingProvider>
    </PortfolioProvider>
  )
}
