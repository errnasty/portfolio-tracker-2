'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="h-8 rounded-md bg-muted/30 animate-pulse" />
  }

  return (
    <div className="flex gap-1 rounded-[10px] bg-[var(--hair)] p-[3px]">
      <button
        type="button"
        onClick={() => setTheme('light')}
        aria-label="Light theme"
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-[8px] py-1.5 text-[12.5px] font-semibold transition-all duration-300',
          theme === 'light'
            ? 'bg-card text-foreground shadow-sm'
            : 'text-faint hover:text-foreground',
        )}
      >
        <Sun className={cn('h-3.5 w-3.5 transition-transform duration-500', theme === 'light' ? 'rotate-0 scale-100' : 'rotate-90 scale-75 opacity-50')} />
        Light
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        aria-label="Dark theme"
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-[8px] py-1.5 text-[12.5px] font-semibold transition-all duration-300',
          theme === 'dark'
            ? 'bg-card text-foreground shadow-sm'
            : 'text-faint hover:text-foreground',
        )}
      >
        <Moon className={cn('h-3.5 w-3.5 transition-transform duration-500', theme === 'dark' ? 'rotate-0 scale-100' : '-rotate-90 scale-75 opacity-50')} />
        Dark
      </button>
    </div>
  )
}
