import { describe, it, expect } from 'vitest'
import { parseDbsAlert } from '../dbs-email-parser'

describe('parseDbsAlert', () => {
  it('parses a card debit alert', () => {
    const r = parseDbsAlert(
      'DBS Card Transaction Alert',
      'You made a transaction of SGD 25.50 at NTUC FAIRPRICE on 15 Jun 2025.',
    )
    expect(r).not.toBeNull()
    expect(r!.amount).toBe(-25.5)
    expect(r!.currency).toBe('SGD')
    expect(r!.merchant).toContain('NTUC FAIRPRICE')
    expect(r!.date).toBe('2025-06-15')
  })

  it('parses a credit/received alert as positive', () => {
    const r = parseDbsAlert(
      'PayNow received',
      'You have received SGD 100.00 from JOHN TAN on 16/06/2025.',
    )
    expect(r!.amount).toBe(100)
    expect(r!.date).toBe('2025-06-16')
  })

  it('handles S$ and HTML bodies', () => {
    const r = parseDbsAlert('Alert', '<p>Payment of <b>S$12.00</b> at <span>GRAB</span></p>')
    expect(r!.amount).toBe(-12)
    expect(r!.currency).toBe('SGD')
  })

  it('returns null for non-transaction emails', () => {
    expect(parseDbsAlert('Your eStatement is ready', 'Log in to view your statement.')).toBeNull()
  })

  it('leaves date null when absent (caller fills from message date)', () => {
    const r = parseDbsAlert('Alert', 'Transaction of SGD 8.80 at KOPITIAM')
    expect(r!.date).toBeNull()
  })
})
