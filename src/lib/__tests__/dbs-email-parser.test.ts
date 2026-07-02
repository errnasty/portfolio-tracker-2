import { describe, it, expect } from 'vitest'
import { parseDbsAlert, cleanMerchant, derivePayeeKey } from '../dbs-email-parser'

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

  it('parses a real PayNow received-transfer alert', () => {
    const r = parseDbsAlert(
      "digibank Alerts - You've received a transfer",
      'Transaction Ref: 012606290119148480EPS0C100564403075 Dear Customer, ' +
      'You have received SGD 30.00 via PayNow on 29 Jun 2026 16:13 SGT. ' +
      'From: TAY KAI YUN CHARMAINE To: Your DBS/ POSB account ending 0152 ' +
      "Didn't expect these funds? Thank you for banking with us.",
    )
    expect(r).not.toBeNull()
    expect(r!.amount).toBe(30)
    expect(r!.currency).toBe('SGD')
    expect(r!.date).toBe('2026-06-29')
    expect(r!.merchant).toBe('TAY KAI YUN CHARMAINE')
    expect(r!.description).toBe('TAY KAI YUN CHARMAINE')
    expect(r!.payeeKey).toBe('name:tay-kai-yun-charmaine')
  })

  it('parses the PayNow outgoing confirmation → To: becomes description', () => {
    const r = parseDbsAlert(
      'DBS PayNow Transaction Completed',
      'Dear Customer, We refer to your PAYNOW dated 02 Jul. We are pleased to confirm ' +
      'that the transaction was completed. Date & Time: 02 Jul 14:55 (SGT) Amount: SGD53.00 ' +
      'From: Ernest Ng Savings A/C ending 0152 ' +
      'To: MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX (MOBILE ending 9989) ' +
      'If unauthorised, please call our DBS hotline. To view transaction details, please login to digibank. ' +
      'Thank you for banking with us.',
    )
    expect(r).not.toBeNull()
    expect(r!.amount).toBe(-53)
    expect(r!.currency).toBe('SGD')
    expect(r!.description).toBe('MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX (MOBILE ending 9989)')
    expect(r!.merchant).toBe('MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX')
    expect(r!.payeeKey).toBe('mobile:9989')
    expect(r!.confidence).toBe('high')
  })

  it('flags low confidence when no counterparty is found', () => {
    const r = parseDbsAlert('GIRO deduction alert', 'A GIRO deduction of SGD 88.00 was made on 03 Jul 2026.')
    expect(r!.confidence).toBe('low')
    expect(r!.payeeKey).toBeNull()
  })

  it('returns null for non-transaction emails', () => {
    expect(parseDbsAlert('Your eStatement is ready', 'Log in to view your statement.')).toBeNull()
  })

  it('leaves date null when absent (caller fills from message date)', () => {
    const r = parseDbsAlert('Alert', 'Transaction of SGD 8.80 at KOPITIAM')
    expect(r!.date).toBeNull()
  })
})

describe('cleanMerchant', () => {
  it('strips a trailing (MOBILE ending NNNN)', () => {
    expect(cleanMerchant('MX TAX HUAXX REX (MOBILE ending 9989)')).toBe('MX TAX HUAXX REX')
  })
  it('strips a trailing A/C ending', () => {
    expect(cleanMerchant('Ernest Ng Savings A/C ending 0152')).toBe('Ernest Ng Savings')
  })
  it('leaves a plain name untouched', () => {
    expect(cleanMerchant('NTUC FAIRPRICE')).toBe('NTUC FAIRPRICE')
  })
})

describe('derivePayeeKey', () => {
  it('prefers mobile-ending', () => {
    expect(derivePayeeKey('MX TAX REX (MOBILE ending 9989)')).toBe('mobile:9989')
  })
  it('falls back to account-ending', () => {
    expect(derivePayeeKey('Some Biz account ending 0152')).toBe('acct:0152')
  })
  it('falls back to a normalized name', () => {
    expect(derivePayeeKey('TAY KAI YUN CHARMAINE')).toBe('name:tay-kai-yun-charmaine')
  })
  it('returns null for empty input', () => {
    expect(derivePayeeKey(null)).toBeNull()
  })
})
