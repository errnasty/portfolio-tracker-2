import { describe, it, expect } from 'vitest'
import { guessCategoryName, DEFAULT_CATEGORIES } from '../categorize'

describe('guessCategoryName', () => {
  it('maps common SG merchants to the right category', () => {
    expect(guessCategoryName('NTUC FAIRPRICE')).toBe('Groceries')
    expect(guessCategoryName('GRAB *TRIP')).toBe('Transport')
    expect(guessCategoryName('GRABFOOD ORDER')).toBe('Food & Dining')
    expect(guessCategoryName('SINGTEL MOBILE BILL')).toBe('Bills & Utilities')
    expect(guessCategoryName('SHOPEE SINGAPORE')).toBe('Shopping')
  })

  it('detects income narratives', () => {
    expect(guessCategoryName('MONTHLY SALARY GIRO')).toBe('Income')
    expect(guessCategoryName('REFUND FROM AMAZON')).toBe('Income')
  })

  it('detects transfers', () => {
    expect(guessCategoryName('PAYNOW TRANSFER TO JOHN')).toBe('Transfers')
  })

  it('treats brokerage top-ups as transfers, not spending', () => {
    expect(guessCategoryName('INTERACTIVE BR SG- REC TRUST')).toBe('Transfers')
    expect(guessCategoryName('IBKR FUNDING')).toBe('Transfers')
  })

  it('returns null when nothing matches', () => {
    expect(guessCategoryName('XYZ UNKNOWN VENDOR 123')).toBeNull()
    expect(guessCategoryName('')).toBeNull()
  })

  it('maps real POSB statement descriptions', () => {
    const cases: [string, string][] = [
      ['HelloRide SINGAPORE SGP 26JUN 5264', 'Transport'],
      ['BUS/MRT 871539432 SI SGP', 'Transport'],
      ['SIMPLYGO SINGAPORE SGP', 'Transport'],
      ['Grab* A-9G3NBL4GX8PVAV Si SGP', 'Transport'],
      ['WWW.TADA.GLOBAL SINGAPORE SGP', 'Transport'],
      ['McDonalds 930014 Si SGP', 'Food & Dining'],
      ['Wingstop Singapore SG SGP', 'Food & Dining'],
      ['05439375,KOUFU PTE LTD NETS CONTACTLESS', 'Food & Dining'],
      ['NTUC FP - TAISENG SI SGP', 'Groceries'],
      ['FAIRPRICE XTRA-AMK SI SGP', 'Groceries'],
      ['DON DON DONKI SINGAPORE SGP', 'Groceries'],
      ['7-ELEVEN-POST CENTRE Sing', 'Groceries'],
      ['Spotify P437998A6F St SWE', 'Bills & Utilities'],
      ['ANTHROPIC* CLAUDE SUB SA USA', 'Bills & Utilities'],
      ['CLAUDE.AI SUBSCRIPTION SA USA', 'Bills & Utilities'],
      ['M1 MAXX SINGAPORE SGP', 'Bills & Utilities'],
      ['CIRCLES.LIFE SINGAPORE SGP', 'Bills & Utilities'],
      ['NEUA DENTAL @ DHOBY GH SI SGP', 'Health'],
      ['KINOKUNIYA-TAKASHIMAYA SI SGP', 'Shopping'],
      ['SHOPEE SG MP Singapore SGP', 'Shopping'],
      ['STEAM PURCHASE SEATTLE DEU', 'Entertainment'],
      // PayNow merchant payments — merchant keyword beats the transfer catch-all.
      ['PayNow Transfer 9210123 To: DUDUXIANG RESTAURANT 711 PTE. L', 'Food & Dining'],
      ['PayNow Transfer 5028469 To: INTERACTIVE BR SG- REC TRUST AC', 'Transfers'],
      // Pure peer transfer → generic Transfers.
      ['PayNow Transfer 6122733 To: CHARMAINE TAY OTHR', 'Transfers'],
      ['Incoming PayNow Ref 8305441 From: TAY KAI YUN CHARMAINE', 'Income'],
      ['MINDEF SAF 12098585', 'Income'],
      ['SEND BACK FROM PAYLAH! : 87751322', 'Income'],
    ]
    for (const [desc, expected] of cases) {
      expect(guessCategoryName(desc), desc).toBe(expected)
    }
  })

  it('maps giving and education', () => {
    expect(guessCategoryName('PayNow Transfer To: FAITH COMMUNITY BAPTIST CHURCH OTHR')).toBe('Giving')
    expect(guessCategoryName('PayNow Transfer To: FCBC - MISSIONS FAITH PLEDGES OTHR')).toBe('Giving')
    expect(guessCategoryName('PayNow Transfer To: NATIONAL UNIVERSITY OF SINGAPOR OTHR')).toBe('Education')
    expect(guessCategoryName('SUTD 27FEB 5264-7110')).toBe('Education')
    expect(guessCategoryName('NTU - SINGPORE SINGAPORE SGP')).toBe('Education')
  })

  it('every guessable category exists in DEFAULT_CATEGORIES', () => {
    const names = new Set(DEFAULT_CATEGORIES.map((c) => c.name))
    for (const sample of ['NTUC', 'GRAB *TRIP', 'GRABFOOD', 'SINGTEL', 'SALARY', 'PAYNOW']) {
      const g = guessCategoryName(sample)
      if (g) expect(names.has(g)).toBe(true)
    }
  })
})
