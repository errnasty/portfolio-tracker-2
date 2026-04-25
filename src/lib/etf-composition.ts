// Static helper: map a country to its primary trading currency.
// ETF/stock composition is now fetched dynamically via /api/analytics
// (see src/app/api/analytics/route.ts) and persisted in the
// etf_composition_cache Supabase table — this file no longer holds
// hardcoded country/sector breakdowns.

export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  'United States': 'USD',
  Canada: 'CAD',
  'United Kingdom': 'GBP',
  France: 'EUR',
  Germany: 'EUR',
  Netherlands: 'EUR',
  Spain: 'EUR',
  Italy: 'EUR',
  Belgium: 'EUR',
  Ireland: 'EUR',
  Finland: 'EUR',
  Austria: 'EUR',
  Portugal: 'EUR',
  Luxembourg: 'EUR',
  Greece: 'EUR',
  Switzerland: 'CHF',
  Sweden: 'SEK',
  Denmark: 'DKK',
  Norway: 'NOK',
  Japan: 'JPY',
  China: 'CNY',
  'Hong Kong': 'HKD',
  Taiwan: 'TWD',
  'South Korea': 'KRW',
  India: 'INR',
  Singapore: 'SGD',
  Australia: 'AUD',
  'New Zealand': 'NZD',
  Brazil: 'BRL',
  Mexico: 'MXN',
  'South Africa': 'ZAR',
  'Saudi Arabia': 'SAR',
  Indonesia: 'IDR',
  Thailand: 'THB',
  Malaysia: 'MYR',
  Philippines: 'PHP',
  Vietnam: 'VND',
  Turkey: 'TRY',
  Poland: 'PLN',
  Israel: 'ILS',
  UAE: 'AED',
  // Region fallbacks
  Global: 'USD',
  'Emerging Markets': 'USD',
  Europe: 'EUR',
  Asia: 'USD',
  Other: 'USD',
  Unknown: 'USD',
}

export function countryToCurrency(country: string): string {
  return COUNTRY_TO_CURRENCY[country] ?? 'USD'
}
