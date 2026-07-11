import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-[20px] border px-2.5 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[var(--accent-soft)] text-accent',
        secondary: 'border-transparent bg-[var(--hair)] text-foreground',
        destructive: 'border-transparent bg-down/10 text-down',
        outline: 'text-foreground border-border',
        up: 'border-transparent bg-[var(--up-soft)] text-up',
        down: 'border-transparent bg-down/10 text-down',
        cool: 'border-transparent bg-cool/10 text-cool',
        warn: 'border-transparent bg-warn/10 text-warn',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
