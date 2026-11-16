import { describe, expect, it } from 'vitest'
import { FEE_CAP_USD, FEE_RATE, feeFor, formatUsd } from '@/lib/fees'

describe('NervixPay seller fee: 0.2% capped at $2, Nervix Space takes nothing', () => {
  it('uses the published rate and cap', () => {
    expect(FEE_RATE).toBe(0.002)
    expect(FEE_CAP_USD).toBe(2)
  })

  it('charges 0.2% below the cap', () => {
    expect(feeFor(10)).toEqual({ price: 10, fee: 0.02, payout: 9.98, capped: false })
    expect(feeFor(500)?.fee).toBeCloseTo(1, 10)
  })

  it('never charges more than $2', () => {
    expect(feeFor(1000)).toMatchObject({ fee: 2, payout: 998 })
    expect(feeFor(25_000)).toEqual({ price: 25_000, fee: 2, payout: 24_998, capped: true })
  })

  it('rejects prices that are not a positive amount', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(feeFor(bad)).toBeNull()
  })

  it('formats dollars for people, without hiding tiny fees', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50')
    expect(formatUsd(0.02)).toBe('$0.02')
    expect(formatUsd(0.004)).toBe('less than $0.01')
  })
})
