import { cn } from '@/lib/utils'

// Console-style status strip: "PTRK ▸ SCREEN ········· right".
export function StatusBar({ screen, right, className }: {
  screen: string
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-6 border-b border-border bg-background px-5 py-2 text-[11px]', className)}>
      <span className="font-bold text-primary">PTRK ▸ {screen}</span>
      {right != null && <span className="ml-auto text-muted-foreground">{right}</span>}
    </div>
  )
}
