import { describe, it, expect } from 'vitest'
import { parsePosbCsv, parsePosbDate } from '../posb-parser'

const SAMPLE = `Account Details For:,POSB Savings
Account Number:,123-45678-9
Available Balance:,4321.00

Transaction Date,Reference,Debit Amount,Credit Amount,Transaction Ref1,Transaction Ref2,Transaction Ref3
15 Jun 2025,ICT,25.50,,NTUC FAIRPRICE,,
16 Jun 2025,SAL,,5000.00,MONTHLY SALARY,,
17 Jun 2025,POS,12.00,,GRAB *TRIP,,
17 Jun 2025,POS,12.00,,GRAB *TRIP,,
`

describe('parsePosbDate', () => {
  it('parses DBS date formats to ISO', () => {
    expect(parsePosbDate('15 Jun 2025')).toBe('2025-06-15')
    expect(parsePosbDate('15/06/2025')).toBe('2025-06-15')
    expect(parsePosbDate('2025-06-15')).toBe('2025-06-15')
    expect(parsePosbDate('15-Jun-25')).toBe('2025-06-15')
    expect(parsePosbDate('not a date')).toBeNull()
  })
})

describe('parsePosbCsv', () => {
  const result = parsePosbCsv(SAMPLE)

  it('finds the header and parses rows', () => {
    expect(result.headerFound).toBe(true)
    expect(result.meta.accountNumber).toContain('123-45678-9')
    const importable = result.rows.filter((r) => r.txn)
    expect(importable.length).toBe(4)
  })

  it('signs debits negative and credits positive', () => {
    const txns = result.rows.map((r) => r.txn).filter(Boolean)
    expect(txns[0]!.amount).toBe(-25.5)   // debit
    expect(txns[1]!.amount).toBe(5000)    // credit
    expect(txns[2]!.amount).toBe(-12)     // debit
  })

  it('gives duplicate same-day rows distinct external_ids', () => {
    const txns = result.rows.map((r) => r.txn).filter(Boolean)
    expect(txns[2]!.external_id).not.toBe(txns[3]!.external_id)
  })

  it('produces stable external_ids across re-parses (dedupe on re-import)', () => {
    const a = parsePosbCsv(SAMPLE).rows.map((r) => r.txn?.external_id)
    const b = parsePosbCsv(SAMPLE).rows.map((r) => r.txn?.external_id)
    expect(a).toEqual(b)
  })

  it('reports no header for non-bank CSV', () => {
    expect(parsePosbCsv('foo,bar\n1,2').headerFound).toBe(false)
  })
})
