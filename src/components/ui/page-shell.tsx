import { StatusBar } from './status-bar'

// Standard page wrapper for every route: status bar, staggered body, optional
// footer key-hint strip. Entrance animation is applied here so pages don't
// each re-implement it.
export function PageShell({ screen, statusRight, footerHints, children }: {
  screen: string
  statusRight?: React.ReactNode
  footerHints?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <StatusBar screen={screen} right={statusRight} />
      <div className="stagger">{children}</div>
      {footerHints != null && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-2.5 text-[11px] text-muted-foreground">
          {footerHints}
        </div>
      )}
    </div>
  )
}
