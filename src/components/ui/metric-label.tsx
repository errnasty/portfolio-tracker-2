'use client'

import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { GLOSSARY } from '@/lib/glossary'
import { cn } from '@/lib/utils'

interface Props {
  // Glossary key — see src/lib/glossary.ts
  term: keyof typeof GLOSSARY
  // Override the visible label (defaults to the glossary entry's term)
  children?: React.ReactNode
  className?: string
}

// Renders a label with a small (i) icon next to it. Hover or focus on the
// icon to see a 1–2 sentence explanation. Use anywhere you would otherwise
// hardcode finance jargon (HHI, Sharpe, alpha, etc.).
export function MetricLabel({ term, children, className }: Props) {
  const entry = GLOSSARY[term]
  if (!entry) return <span className={className}>{children}</span>

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span>{children ?? entry.term}</span>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`What is ${entry.term}?`}
              className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="font-semibold">{entry.short}</div>
            <div className="mt-0.5 text-muted-foreground">{entry.long}</div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  )
}
