import { describe, it, expect } from 'vitest'
import { parseLionGlobalFundlist } from '@/lib/server/fund-scrapers/lionglobal'

const OK = `<funds totalpage="1"><fund><f_code><![CDATA[SST6]]></f_code>` +
  `<eng_lgi><![CDATA[LionGlobal Singapore Trust Fund Class O SGD (MDist)]]></eng_lgi>` +
  `<currency><![CDATA[SGD]]></currency><nav>1.0620</nav><dealdate>2026-07-16</dealdate></fund></funds>`

const EMPTY = `<funds totalpage="0"></funds>`

describe('parseLionGlobalFundlist', () => {
  it('extracts nav, date, name, currency (CDATA-wrapped or not)', () => {
    expect(parseLionGlobalFundlist(OK)).toEqual({
      price: 1.062,
      asOf: '2026-07-16',
      name: 'LionGlobal Singapore Trust Fund Class O SGD (MDist)',
      currency: 'SGD',
    })
  })

  it('returns null when the fund code is unknown (no nav)', () => {
    expect(parseLionGlobalFundlist(EMPTY)).toBeNull()
  })

  it('returns null on a zero/garbage nav', () => {
    expect(parseLionGlobalFundlist('<funds><fund><nav>0</nav></fund></funds>')).toBeNull()
  })
})
