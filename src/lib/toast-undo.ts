'use client'

import { toast } from 'sonner'

/**
 * Run a destructive action and show an undo toast. The action is performed
 * immediately (not deferred), and the toast button restores the row by
 * calling `restore` with the original payload.
 *
 * Use this for delete buttons across the app — Holdings, Transactions, Cash,
 * Goals, Targets. Pattern:
 *
 *   await deleteWithUndo({
 *     description: `Deleted ${ticker}`,
 *     remove: () => deleteHolding(id),
 *     restore: () => addHolding({ ticker, shares, ... }),
 *   })
 */
export async function deleteWithUndo(opts: {
  description: string
  remove: () => Promise<void>
  restore: () => Promise<void>
  durationMs?: number
}): Promise<void> {
  await opts.remove()

  toast(opts.description, {
    duration: opts.durationMs ?? 5000,
    action: {
      label: 'Undo',
      onClick: () => {
        // Restore on click. We re-throw failures into another toast rather
        // than let them disappear silently — the user expects undo to work.
        opts.restore().catch((err) => {
          console.error('Undo failed:', err)
          toast.error('Failed to restore — check the page or try again')
        })
      },
    },
  })
}
