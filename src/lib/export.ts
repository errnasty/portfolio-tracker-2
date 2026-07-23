// CSV export helpers, shared across the report page and the list pages
// (Holdings, Transactions). Kept dependency-free — a Blob + anchor click,
// which works in every browser and needs no server round-trip.

// Serialize a 2D array to RFC-4180-ish CSV, quoting any cell that contains a
// comma, quote, or newline.
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '')
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\n')
}

// Trigger a client-side download of CSV content.
export function downloadCsv(filename: string, content: string): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Convenience: rows → download in one call, stamping the date into the name.
export function exportCsv(baseName: string, rows: (string | number | null | undefined)[][]): void {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadCsv(`${baseName}-${stamp}.csv`, toCsv(rows))
}
