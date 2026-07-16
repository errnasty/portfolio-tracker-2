// Shared Yahoo Finance quote fetcher — used by /api/prices (client-facing)
// and the daily cron (server-side price cache warm-up). Three independent
// endpoint strategies, since Yahoo's unofficial APIs are individually flaky.

export interface YahooQuote {
  price: number
  currency: string
  change: number
  changePercent: number
  longName?: string
}

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com',
  'Origin': 'https://finance.yahoo.com',
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url: string, timeoutMs = 9000): Promise<any> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: YF_HEADERS, signal: controller.signal })
    if (res.status === 429) throw Object.assign(new Error('rate-limited'), { code: 429 })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(t)
  }
}

// ── Strategy 1: v8 chart API ──────────────────────────────────────────────
async function tryChart(ticker: string): Promise<YahooQuote | null> {
  for (const domain of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const url = `https://${domain}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`
      const data = await fetchJson(url)
      const meta = data?.chart?.result?.[0]?.meta
      if (!meta) continue
      const price: number =
        meta.regularMarketPrice ?? meta.chartPreviousClose ?? meta.previousClose ?? 0
      if (price <= 0) continue
      const prev: number = meta.chartPreviousClose ?? meta.previousClose ?? price
      return {
        price,
        currency: (meta.currency ?? 'USD') as string,
        change: price - prev,
        changePercent: prev > 0 ? ((price - prev) / prev) * 100 : 0,
        longName: (meta.longName ?? meta.shortName ?? ticker) as string,
      }
    } catch (e: any) {
      if (e.code === 429) await sleep(500)
    }
  }
  return null
}

// ── Strategy 2: v1 search API (separate endpoint / rate limit) ────────────
async function trySearch(ticker: string): Promise<YahooQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=3&newsCount=0`
    const data = await fetchJson(url)
    const match = (data?.quotes ?? []).find(
      (q: any) => q.symbol?.toUpperCase() === ticker.toUpperCase(),
    )
    if (!match) return null
    const price: number = match.regularMarketPrice ?? match.regularMarketPreviousClose ?? 0
    if (price <= 0) return null
    const prev: number = match.regularMarketPreviousClose ?? price
    return {
      price,
      currency: (match.currency ?? 'USD') as string,
      change: price - prev,
      changePercent: prev > 0 ? ((price - prev) / prev) * 100 : 0,
      longName: (match.longname ?? match.shortname ?? ticker) as string,
    }
  } catch {
    return null
  }
}

// ── Strategy 3: quoteSummary API ──────────────────────────────────────────
async function tryQuoteSummary(ticker: string): Promise<YahooQuote | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=price`
    const data = await fetchJson(url)
    const p = data?.quoteSummary?.result?.[0]?.price
    if (!p) return null
    const price: number = p.regularMarketPrice?.raw ?? 0
    if (price <= 0) return null
    const prev: number = p.regularMarketPreviousClose?.raw ?? price
    return {
      price,
      currency: (p.currency ?? 'USD') as string,
      change: price - prev,
      changePercent: prev > 0 ? ((price - prev) / prev) * 100 : 0,
      longName: (p.longName ?? p.shortName ?? ticker) as string,
    }
  } catch {
    return null
  }
}

async function fetchYahooQuote(ticker: string): Promise<YahooQuote> {
  const chart = await tryChart(ticker)
  if (chart) return chart

  await sleep(200)
  const search = await trySearch(ticker)
  if (search) return search

  await sleep(200)
  const summary = await tryQuoteSummary(ticker)
  if (summary) return summary

  throw new Error(`All strategies failed for ${ticker}`)
}

// Fetches quotes for many tickers, batched (3 at a time, paced) to stay
// under Yahoo's informal rate limits. Failed tickers come back as
// price: 0 rather than being omitted, so callers can distinguish
// "no data" from "not requested".
export async function fetchQuotes(tickers: string[]): Promise<Record<string, YahooQuote & { ticker: string }>> {
  const results: Record<string, YahooQuote & { ticker: string }> = {}
  const BATCH = 3
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH)
    await Promise.allSettled(
      batch.map(async (ticker) => {
        try {
          results[ticker] = { ticker, ...await fetchYahooQuote(ticker) }
        } catch (err) {
          console.error(`[yahoo] ${ticker} failed:`, String(err))
          results[ticker] = { ticker, price: 0, currency: 'USD', change: 0, changePercent: 0 }
        }
      }),
    )
    if (i + BATCH < tickers.length) await sleep(500)
  }
  return results
}
