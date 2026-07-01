'use client'
import Link from 'next/link'
import { useViewTransitionRouter } from './ViewTransitionProvider'

// Drop-in <Link> that routes through the View Transition navigate so in-app
// navigation morphs instead of hard-cutting. Falls back to default behaviour
// for modified clicks (new tab, etc).
export function TLink({ href, children, onClick, ...rest }: React.ComponentProps<typeof Link>) {
  const navigate = useViewTransitionRouter()
  return (
    <Link
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(typeof href === 'string' ? href : String(href))
      }}
      {...rest}
    >
      {children}
    </Link>
  )
}
