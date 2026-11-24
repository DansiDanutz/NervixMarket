/** What a seller pays per NervixPay payment: 0.2%, capped at $2. Nervix Space itself takes nothing.
 *  Display-only arithmetic for the sell page; NervixPay computes the real fee. */

export const FEE_RATE = 0.002
export const FEE_CAP_USD = 2

export interface FeeBreakdown { price: number; fee: number; payout: number; capped: boolean }

/** Rounds away floating-point noise (0.1 + 0.2) without hiding sub-cent fees. */
const clean = (n: number) => Math.round(n * 1e6) / 1e6

export function feeFor(price: number): FeeBreakdown | null {
  if (!Number.isFinite(price) || price <= 0) return null
  const raw = price * FEE_RATE
  const fee = clean(Math.min(raw, FEE_CAP_USD))
  return { price, fee, payout: clean(price - fee), capped: raw > FEE_CAP_USD }
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const SMALLEST = 0.01

export function formatUsd(amount: number): string {
  if (amount > 0 && amount < SMALLEST) return 'less than $0.01'
  return USD.format(amount)
}
