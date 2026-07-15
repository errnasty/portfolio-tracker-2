import { describe, it, expect } from 'vitest'
import { parseLionGlobalHtml } from '../server/fund-scrapers/lionglobal'

describe('parseLionGlobalHtml', () => {
  it('extracts NAV, as-of date, and name from a typical fund page', () => {
    const html = `
      <html><head><title>LionGlobal Singapore Trust Fund Class O SGD | Lion Global Investors</title></head>
      <body>
        <h1>LionGlobal Singapore Trust Fund Class O SGD</h1>
        <div class="fund-price">NAV Price: SGD 1.8420</div>
        <div class="fund-date">Price as at 14 Jul 2026</div>
      </body></html>
    `
    const q = parseLionGlobalHtml(html, 'SST6')
    expect(q.price).toBe(1.842)
    expect(q.asOf).toBe('2026-07-14')
    expect(q.name).toBe('LionGlobal Singapore Trust Fund Class O SGD')
  })

  it('falls back to Bid Price when NAV is not labeled directly', () => {
    const html = `
      <html><head><title>LionGlobal Short Duration Bond Fund | Lion Global Investors</title></head>
      <body><table><tr><td>Bid Price</td><td>1.0512</td></tr></table>
      <p>Data as at 01/07/2026</p></body></html>
    `
    const q = parseLionGlobalHtml(html, 'SDB')
    expect(q.price).toBe(1.0512)
    expect(q.asOf).toBe('2026-07-01')
  })

  it('throws when no price can be found', () => {
    const html = '<html><head><title>Fund not found</title></head><body>No data available.</body></html>'
    expect(() => parseLionGlobalHtml(html, 'XXXX')).toThrow()
  })

  it('returns a null asOf date when no date label is present', () => {
    const html = '<html><head><title>Some Fund</title></head><body>NAV: 2.3400</body></html>'
    const q = parseLionGlobalHtml(html, 'ABC')
    expect(q.price).toBe(2.34)
    expect(q.asOf).toBeNull()
  })
})
