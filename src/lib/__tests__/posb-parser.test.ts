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

// Matches the real digibank export layout (Status + Debit/Credit columns,
// dd-Mon-yy dates, separate Description + Ref columns).
const REAL = `Account Details For:,Ernest Ng Savings 244-92015-2
Statement Date:,30-Jun-26
Available Balance:,SGD 219.17
Ledger Balance:,SGD 269.50

Transaction Date,Transaction Type,Description,Transaction Ref1,Transaction Ref2,Transaction Ref3,Status,Debit Amount,Credit Amount
29-Jun-26,UMC-S,SHOPEE SINGAPORE,SHOPEE SG,5264-7110,000002621,Settled,145.34,
29-Jun-26,ICT,Incoming,Incoming,From: TAY,OTHR OTH,Settled,,30.00
28-Jun-26,ITR,INTERACTIVE BR SG- REC TRUST,IBKR,,,Settled,500.00,
`

describe('parsePosbCsv — real digibank layout', () => {
  const res = parsePosbCsv(REAL)
  const txns = res.rows.map((r) => r.txn).filter(Boolean)

  it('parses all rows with correct signs and dates', () => {
    expect(res.headerFound).toBe(true)
    expect(txns.length).toBe(3)
    expect(txns[0]!.amount).toBe(-145.34)
    expect(txns[1]!.amount).toBe(30)
    expect(txns[2]!.amount).toBe(-500)
    expect(txns[0]!.date).toBe('2026-06-29')
    expect(txns[2]!.date).toBe('2026-06-28')
  })

  it('keeps the description text used for categorization', () => {
    expect(txns[0]!.description).toContain('SHOPEE')
    expect(txns[2]!.description).toContain('INTERACTIVE BR')
  })
})
