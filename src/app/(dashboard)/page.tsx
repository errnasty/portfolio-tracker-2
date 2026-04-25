'use client'
// Route group root — redirects to /dashboard to avoid conflict with app/page.tsx
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardGroupRoot() {
  const router = useRouter()
  useEffect(() => { router.replace('/dashboard') }, [router])
  return null
}
