// Yahoo Finance now requires a session crumb + cookie pair on most data
// endpoints (notably /v10/finance/quoteSummary). This module manages the
// crumb dance: fetch a cookie from fc.yahoo.com, exchange it for a crumb
// at /v1/test/getcrumb, and reuse both for ~1 hour.

const YF_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

interface YahooAuth {
  crumb: string
  cookie: string
  expiresAt: number
}

let cached: YahooAuth | null = null

function extractCookies(res: Response): string {
  const h = res.headers as any
  let cookies: string[] = []
  if (typeof h.getSetCookie === 'function') {
    cookies = h.getSetCookie()
  } else if (typeof h.raw === 'function') {
    const raw = h.raw()
    cookies = raw['set-cookie'] ?? []
  } else {
    const single = res.headers.get('set-cookie')
    if (single) cookies = [single]
  }
  return cookies.map((c) => c.split(';')[0]).filter(Boolean).join('; ')
}

async function fetchAuth(): Promise<YahooAuth | null> {
  try {
    // Step 1: hit fc.yahoo.com (or finance.yahoo.com) to get a session cookie
    const seedRes = await fetch('https://fc.yahoo.com', {
      headers: YF_HEADERS,
      redirect: 'manual',
    }).catch(() => null)

    let cookie = seedRes ? extractCookies(seedRes) : ''

    if (!cookie) {
      // Fallback seed
      const fallback = await fetch('https://finance.yahoo.com', {
        headers: YF_HEADERS,
      }).catch(() => null)
      if (fallback) cookie = extractCookies(fallback)
    }

    if (!cookie) return null

    // Step 2: exchange cookie for crumb
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...YF_HEADERS, Cookie: cookie },
    })
    if (!crumbRes.ok) return null
    const crumb = (await crumbRes.text()).trim()
    if (!crumb || crumb.length > 64) return null

    return { crumb, cookie, expiresAt: Date.now() + 60 * 60 * 1000 } // 1 hour
  } catch (err) {
    console.error('[yahoo-auth] failed to fetch crumb:', err)
    return null
  }
}

export async function getYahooAuth(): Promise<YahooAuth | null> {
  if (cached && cached.expiresAt > Date.now()) return cached
  cached = await fetchAuth()
  return cached
}

export function invalidateYahooAuth() {
  cached = null
}

export const YAHOO_HEADERS = YF_HEADERS
