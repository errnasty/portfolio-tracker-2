import { describe, it, expect } from 'vitest'
import { fitWithinEdge } from '../image'

describe('fitWithinEdge', () => {
  it('leaves a small image unchanged', () => {
    expect(fitWithinEdge(800, 600, 1280)).toEqual({ width: 800, height: 600 })
  })

  it('scales down a landscape image preserving aspect ratio', () => {
    const r = fitWithinEdge(4000, 3000, 1280)
    expect(r.width).toBe(1280)
    expect(r.height).toBe(960)
  })

  it('scales down a portrait image preserving aspect ratio', () => {
    const r = fitWithinEdge(3000, 4000, 1280)
    expect(r.width).toBe(960)
    expect(r.height).toBe(1280)
  })

  it('never upscales', () => {
    expect(fitWithinEdge(100, 50, 1280)).toEqual({ width: 100, height: 50 })
  })

  it('handles a square image', () => {
    expect(fitWithinEdge(2000, 2000, 1280)).toEqual({ width: 1280, height: 1280 })
  })
})
