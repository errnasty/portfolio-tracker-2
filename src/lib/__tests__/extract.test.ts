import { describe, it, expect } from 'vitest'
import { validateExtractResponse, buildExtractPrompt } from '../extract'

describe('validateExtractResponse', () => {
  it('parses a debit into a negative amount', () => {
    const d = validateExtractResponse({ amount: 25.5, direction: 'debit', currency: 'SGD', date: '2026-07-10', merchant: 'NTUC', description: 'Groceries' })
    expect(d).not.toBeNull()
    expect(d!.amount).toBe(-25.5)
    expect(d!.currency).toBe('SGD')
    expect(d!.date).toBe('2026-07-10')
    expect(d!.merchant).toBe('NTUC')
  })

  it('parses a credit into a positive amount', () => {
    const d = validateExtractResponse({ amount: 3000, direction: 'credit', currency: 'usd', description: 'Salary' })
    expect(d!.amount).toBe(3000)
    expect(d!.currency).toBe('USD')
  })

  it('accepts a JSON string, including fenced', () => {
    const d = validateExtractResponse('```json\n{"amount": 9.9, "direction": "debit", "currency": "SGD"}\n```')
    expect(d!.amount).toBe(-9.9)
  })

  it('defaults an invalid currency to SGD', () => {
    const d = validateExtractResponse({ amount: 5, direction: 'debit', currency: 'dollars' })
    expect(d!.currency).toBe('SGD')
  })

  it('drops an invalid date to null', () => {
    const d = validateExtractResponse({ amount: 5, direction: 'debit', date: '10 Jul 2026' })
    expect(d!.date).toBeNull()
  })

  it('returns null when amount is zero or missing', () => {
    expect(validateExtractResponse({ amount: 0, direction: 'debit' })).toBeNull()
    expect(validateExtractResponse({ direction: 'debit' })).toBeNull()
    expect(validateExtractResponse('not json')).toBeNull()
    expect(validateExtractResponse(null)).toBeNull()
  })

  it('falls back to merchant for description when description is empty', () => {
    const d = validateExtractResponse({ amount: 5, direction: 'debit', merchant: 'Grab', description: '' })
    expect(d!.description).toBe('Grab')
  })
})

describe('buildExtractPrompt', () => {
  it('embeds the text and truncates very long input', () => {
    const p = buildExtractPrompt('paid SGD 12.00 to NTUC')
    expect(p).toContain('paid SGD 12.00 to NTUC')
    const long = buildExtractPrompt('x'.repeat(5000))
    expect(long.length).toBeLessThan(4000)
  })
})
