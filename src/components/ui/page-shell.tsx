import { StatusBar } from './status-bar'

// Standard page wrapper for every route: Aureus page header, staggered body.
export function PageShell({ screen, title, statusRight, footerHints, hideFooter, children }: {
  screen: string
  title?: string
  statusRight?: React.ReactNode
  footerHints?: React.ReactNode
  hideFooter?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="animate-section-in">
      <StatusBar screen={screen} title={title} right={statusRight} />
      <div className="stagger">{children}</div>
      {!hideFooter && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-border py-3 text-[11px] text-muted-foreground">
          <span className="flex flex-wrap items-center gap-x-3">{footerHints}</span>
          <span>press <span className="text-foreground">⌘K</span> for command palette</span>
        </div>
      )}
    </div>
  )
}
