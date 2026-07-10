'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Sheet({ open, onClose, title, subtitle, children }: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/34 animate-fade-in backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 z-[71] h-full w-[380px] max-w-[88vw] overflow-y-auto border-l border-border bg-card p-7 shadow-2xl animate-drawer-in">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-2xl font-medium text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-[var(--hair)] text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {subtitle && <p className="mb-6 text-[13px] text-muted-foreground">{subtitle}</p>}
        {children}
      </div>
    </>
  )
}

export function SheetFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-7 flex gap-2.5">{children}</div>
}

export function SheetButton({ variant, onClick, children }: {
  variant: 'primary' | 'outline'
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 rounded-[10px] py-2.5 text-[13.5px] font-semibold transition-all press',
        variant === 'primary'
          ? 'bg-[var(--accent)] text-[var(--accent-text)] hover:brightness-1.08'
          : 'border border-border bg-transparent text-foreground hover:bg-[var(--hair)]',
      )}
    >
      {children}
    </button>
  )
}
