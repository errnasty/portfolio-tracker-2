'use client'
import { createContext, useCallback, useContext } from 'react'
import { useRouter } from 'next/navigation'

type Nav = (href: string) => void
const Ctx = createContext<Nav>(() => {})

// Navigate with a View Transition when the browser supports it, otherwise a
// plain push. Consumers: TLink, CommandPalette, KeyboardProvider.
export const useViewTransitionRouter = () => useContext(Ctx)

export function ViewTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const navigate = useCallback<Nav>((href) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void }
    if (typeof doc.startViewTransition === 'function') doc.startViewTransition(() => router.push(href))
    else router.push(href)
  }, [router])
  return <Ctx.Provider value={navigate}>{children}</Ctx.Provider>
}
