import { describe, it, expect } from 'vitest'
import { normalizeInboundEmail, extractEmailAddress } from '../inbound-payload'

describe('extractEmailAddress', () => {
  it('pulls the bare address out of "Name <addr>"', () => {
    expect(extractEmailAddress('DBS Bank <ibanking.alert@dbs.com>')).toBe('ibanking.alert@dbs.com')
  })
  it('handles a bare address', () => {
    expect(extractEmailAddress('abc123@cloudmailin.net')).toBe('abc123@cloudmailin.net')
  })
  it('lowercases', () => {
    expect(extractEmailAddress('ABC@Example.COM')).toBe('abc@example.com')
  })
  it('returns empty for junk', () => {
    expect(extractEmailAddress('')).toBe('')
  })
})

describe('normalizeInboundEmail — CloudMailin multipart', () => {
  it('reads envelope[to] as the top recipient', () => {
    const fd = new FormData()
    fd.set('envelope[to]', 'abc123@cloudmailin.net')
    fd.set('envelope[from]', 'ibanking.alert@dbs.com')
    fd.set('to', 'me@gmail.com') // original recipient, preserved by Gmail forward
    fd.set('headers[Subject]', 'Transaction Alert')
    fd.set('plain', 'You paid SGD 25.50 to NTUC')
    fd.set('html', '<p>You paid SGD 25.50</p>')
    const n = normalizeInboundEmail('multipart/form-data; boundary=x', fd)
    expect(n.recipients[0]).toBe('abc123@cloudmailin.net')
    expect(n.recipients).toContain('me@gmail.com')
    expect(n.from).toBe('ibanking.alert@dbs.com')
    expect(n.subject).toBe('Transaction Alert')
    expect(n.text).toContain('SGD 25.50')
  })
})

describe('normalizeInboundEmail — CloudMailin JSON', () => {
  it('reads nested envelope.to and plain', () => {
    const body = {
      envelope: { to: 'abc123@cloudmailin.net', from: 'alert@dbs.com' },
      headers: { Subject: 'Alert' },
      plain: 'debited SGD 12.00',
      html: '<p>debited</p>',
    }
    const n = normalizeInboundEmail('application/json', body)
    expect(n.recipients[0]).toBe('abc123@cloudmailin.net')
    expect(n.from).toBe('alert@dbs.com')
    expect(n.subject).toBe('Alert')
    expect(n.text).toBe('debited SGD 12.00')
  })
})

describe('normalizeInboundEmail — Postmark JSON', () => {
  it('prefers OriginalRecipient over To (the Gmail-forward case)', () => {
    const body = {
      To: 'me@gmail.com',
      OriginalRecipient: 'abc123@inbound.aureus.app',
      From: 'DBS <ibanking.alert@dbs.com>',
      Subject: 'Txn',
      TextBody: 'SGD 9.90 spent',
      HtmlBody: '<p>x</p>',
    }
    const n = normalizeInboundEmail('application/json', body)
    expect(n.recipients[0]).toBe('abc123@inbound.aureus.app')
    expect(n.from).toBe('ibanking.alert@dbs.com')
    expect(n.text).toBe('SGD 9.90 spent')
  })
})

describe('normalizeInboundEmail — raw RFC 822', () => {
  it('prefers Delivered-To over To', () => {
    const raw = [
      'Delivered-To: abc123@cloudmailin.net',
      'To: me@gmail.com',
      'From: alert@dbs.com',
      'Subject: Alert',
      '',
      'You spent SGD 40.00 at Cold Storage',
    ].join('\n')
    const n = normalizeInboundEmail('text/plain', raw)
    expect(n.recipients[0]).toBe('abc123@cloudmailin.net')
    expect(n.recipients).toContain('me@gmail.com')
    expect(n.text.trim()).toBe('You spent SGD 40.00 at Cold Storage')
  })

  it('splits a comma-separated To list', () => {
    const raw = ['To: a@x.com, b@y.com', 'From: c@z.com', 'Subject: s', '', 'body'].join('\n')
    const n = normalizeInboundEmail('text/plain', raw)
    expect(n.recipients).toEqual(['a@x.com', 'b@y.com'])
  })
})
