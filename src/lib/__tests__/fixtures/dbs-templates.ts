import type { ParsedEmailTxn } from '@/lib/dbs-email-parser'

export interface Fixture {
  name: string
  subject: string
  body: string
  expected: Partial<ParsedEmailTxn>
}

// One anonymized sample per real DBS/POSB template. Add a template = add an entry.
export const DBS_FIXTURES: Fixture[] = [
  {
    name: 'PayNow outgoing confirmation',
    subject: 'DBS PayNow Transaction Completed',
    body:
      'Dear Customer, We refer to your PAYNOW dated 02 Jul. We are pleased to confirm ' +
      'that the transaction was completed. Date & Time: 02 Jul 14:55 (SGT) Amount: SGD53.00 ' +
      'From: Ernest Ng Savings A/C ending 0152 ' +
      'To: MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX (MOBILE ending 9989) ' +
      'If unauthorised, please call our DBS hotline. Thank you for banking with us.',
    expected: {
      amount: -53,
      currency: 'SGD',
      description: 'MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX (MOBILE ending 9989)',
      merchant: 'MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX',
      payeeKey: 'mobile:9989',
      confidence: 'high',
    },
  },
  {
    name: 'PayNow incoming transfer',
    subject: "digibank Alerts - You've received a transfer",
    body:
      'Transaction Ref: 012606290119148480 Dear Customer, You have received SGD 30.00 via PayNow ' +
      'on 29 Jun 2026 16:13 SGT. From: TAY KAI YUN CHARMAINE To: Your DBS/ POSB account ending 0152 ' +
      "Didn't expect these funds? Thank you for banking with us.",
    expected: {
      amount: 30,
      currency: 'SGD',
      description: 'TAY KAI YUN CHARMAINE',
      payeeKey: 'name:tay-kai-yun-charmaine',
      confidence: 'high',
    },
  },
  {
    name: 'Card debit alert',
    subject: 'DBS Card Transaction Alert',
    body: 'You made a transaction of SGD 25.50 at NTUC FAIRPRICE on 15 Jun 2025.',
    expected: { amount: -25.5, merchant: 'NTUC FAIRPRICE', date: '2025-06-15', confidence: 'high' },
  },
  {
    name: 'PayLah! payment (S$, HTML body)',
    subject: 'Alert',
    body: '<p>Payment of <b>S$12.00</b> at <span>GRAB</span></p>',
    expected: { amount: -12, currency: 'SGD', merchant: 'GRAB', confidence: 'high' },
  },
  {
    name: 'GIRO deduction (no counterparty → low confidence)',
    subject: 'GIRO deduction alert',
    body: 'A GIRO deduction of SGD 88.00 was made on 03 Jul 2026.',
    expected: { amount: -88, confidence: 'low', payeeKey: null },
  },
]
