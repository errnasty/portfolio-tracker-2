'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  value: number
  // Format the value for display (e.g. currency formatting)
  format?: (n: number) => string
  // Number of decimals to show in the input field
  inputStep?: string
  // Called when the user commits a new value (Enter or blur with changes)
  onSave: (newValue: number) => Promise<void>
  // Right-align the cell (for numeric columns)
  align?: 'left' | 'right'
  // Disable editing
  disabled?: boolean
  // Optional sub-line shown below the value (e.g. cost basis currency)
  subline?: React.ReactNode
  // Minimum allowed value
  min?: number
  // ARIA label
  ariaLabel?: string
}

// A table cell that flips between display and edit modes. Click to edit,
// type a new number, press Enter or click the green check to save, Escape
// or the red x to cancel. Blur with unchanged value also cancels silently.
export function InlineNumberCell({
  value, format, inputStep = 'any', onSave,
  align = 'right', disabled, subline, min = 0, ariaLabel,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const startEdit = () => {
    if (disabled || saving) return
    setDraft(String(value))
    setEditing(true)
    setError(false)
  }

  const cancel = () => { setEditing(false); setError(false) }

  const commit = async () => {
    const num = parseFloat(draft)
    if (isNaN(num) || num < min) {
      setError(true)
      inputRef.current?.focus()
      return
    }
    if (num === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(num)
      setEditing(false)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  if (editing) {
    return (
      <div className={cn(
        'flex items-center gap-1',
        align === 'right' ? 'justify-end' : 'justify-start',
      )}>
        <input
          ref={inputRef}
          type="number"
          step={inputStep}
          min={min}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(false) }}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            // Don't cancel if focus moved to one of the action buttons
            const next = e.relatedTarget as HTMLElement | null
            if (next?.dataset.inlineEditAction) return
            commit()
          }}
          disabled={saving}
          aria-label={ariaLabel}
          className={cn(
            'h-7 w-24 rounded border bg-background px-1.5 text-sm font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-ring',
            error ? 'border-red-500' : 'border-border',
            align === 'right' && 'text-right',
          )}
        />
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <>
            <button
              type="button"
              data-inline-edit-action="save"
              onMouseDown={(e) => e.preventDefault()}
              onClick={commit}
              className="rounded p-0.5 text-emerald-400 hover:bg-emerald-500/10"
              aria-label="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-inline-edit-action="cancel"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancel}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={disabled}
      className={cn(
        'group w-full rounded px-1 py-0.5 text-sm transition-colors',
        align === 'right' ? 'text-right' : 'text-left',
        disabled
          ? 'cursor-default'
          : 'cursor-text hover:bg-accent/40 hover:ring-1 hover:ring-border',
      )}
      aria-label={ariaLabel}
      title={disabled ? undefined : 'Click to edit'}
    >
      <div className="font-mono tabular-nums">{format ? format(value) : value}</div>
      {subline && <div className="text-xs text-muted-foreground">{subline}</div>}
    </button>
  )
}
