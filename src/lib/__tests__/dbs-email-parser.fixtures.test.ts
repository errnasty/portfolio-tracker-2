import { describe, it, expect } from 'vitest'
import { parseDbsAlert, type ParsedEmailTxn } from '../dbs-email-parser'
import { DBS_FIXTURES } from './fixtures/dbs-templates'

describe('DBS template fixtures', () => {
  for (const fx of DBS_FIXTURES) {
    it(fx.name, () => {
      const r = parseDbsAlert(fx.subject, fx.body)
      expect(r).not.toBeNull()
      for (const [k, v] of Object.entries(fx.expected)) {
        expect(r![k as keyof ParsedEmailTxn]).toBe(v)
      }
    })
  }
})
