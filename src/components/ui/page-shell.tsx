import { StatusBar } from './status-bar'

// Standard page wrapper for every route: status bar, staggered body, and a
// footer key-hint strip. The "press k" palette hint is always shown on the
// right; pass `footerHints` for page-specific go-to shortcuts on the left.
export function PageShell({ screen, statusRight, footerHints, hideFooter, children }: {
  screen: string
  statusRight?: React.ReactNode
  footerHints?: React.ReactNode
  hideFooter?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <StatusBar screen={screen} right={statusRight} />
      <div className="stagger">{children}</div>
      {!hideFooter && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-2.5 text-[11px] text-muted-foreground">
          <span className="flex flex-wrap items-center gap-x-3">{footerHints}</span>
          <span>press <span className="text-foreground">k</span> for command palette</span>
        </div>
      )}
    </div>
  )
}
