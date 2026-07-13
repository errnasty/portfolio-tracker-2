import { describe, it, expect } from 'vitest'
import { parseQuickEntry } from '../quick-parse'

describe('parseQuickEntry', () => {
  it('parses amount-first entries', () => {
    expect(parseQuickEntry('14.50 lunch grab')).toEqual({ amount: 14.5, description: 'lunch grab', kind: 'expense' })
  })

  it('parses amount-last entries', () => {
    expect(parseQuickEntry('grab lunch 14.5')).toEqual({ amount: 14.5, description: 'grab lunch', kind: 'expense' })
  })

  it('treats a + prefix as income and strips $ and commas', () => {
    expect(parseQuickEntry('+2,500 july salary')).toEqual({ amount: 2500, description: 'july salary', kind: 'income' })
    expect(parseQuickEntry('$4 coffee')).toEqual({ amount: 4, description: 'coffee', kind: 'expense' })
  })

  it('does not mistake hyphenated names for amounts', () => {
    const r = parseQuickEntry('7-eleven snacks 3.20')
    expect(r.amount).toBe(3.2)
    expect(r.description).toBe('7-eleven snacks')
  })

  it('handles missing amount or empty input', () => {
    expect(parseQuickEntry('lunch with ben')).toEqual({ amount: null, description: 'lunch with ben', kind: 'expense' })
    expect(parseQuickEntry('   ')).toEqual({ amount: null, description: '', kind: 'expense' })
  })
})
