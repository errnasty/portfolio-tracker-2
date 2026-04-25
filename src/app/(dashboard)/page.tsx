import { redirect } from 'next/navigation'

// This file exists alongside app/page.tsx due to the route group structure.
// Both resolve to "/" and both redirect to /dashboard — Next.js uses whichever
// it picks first. No client code here to avoid the manifest build error.
export default function DashboardGroupRoot() {
  redirect('/dashboard')
}
