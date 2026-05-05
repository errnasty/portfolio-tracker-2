'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — theme is unknown server-side
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="h-8 rounded-md bg-muted/30 animate-pulse" />
  }

  return (
    <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon
        const active = theme === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-label={opt.label}
            className={cn(
              'flex flex-1 items-center justify-center rounded-sm px-2 py-1.5 transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
