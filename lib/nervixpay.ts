import { createHmac, timingSafeEqual } from 'node:crypto'

/** NervixPay integration for Nervix Space's own revenue: "Featured" is one shared NervixPay payment
 *  link (10 USD, USDT/USDC). Each checkout carries the listing id as `ref`; NervixPay's signed
 *  `payment.paid` webhook returns it as `customerReference`, and that is what features the listing.
 *  Nothing here holds or moves funds: the payer's wallet pays Dan's wallet directly, NervixPay verifies
 *  it on-chain. (Sellers' own sales go to their own NervixPay links, never through here.) */

import { FEATURE_USD } from './listing'
export { FEATURE_USD }
export const ACCEPTED_TOKENS = ['USDT', 'USDC'] as const
const REPLAY_WINDOW_S = 5 * 60

export const config = () => ({
  base: (process.env.NERVIXPAY_BASE_URL || 'https://nervixpay.live').replace(/\/$/, ''),
  linkId: process.env.NERVIXPAY_LINK_ID || '',
  secret: process.env.NERVIXPAY_WEBHOOK_SECRET || '',
  featureDays: Number(process.env.FEATURE_DAYS || process.env.MEMBERSHIP_DAYS || 30),
})

/** The hosted checkout for one listing. */
export function checkoutUrl(listingId: string, email?: string, c = config()): string | null {
  if (!c.linkId) return null
  const u = new URL(`${c.base}/l/${encodeURIComponent(c.linkId)}`)
  u.searchParams.set('ref', listingId)
  if (email) u.searchParams.set('email', email)
  return u.toString()
}

/** `X-NervixPay-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>` (several v1 allowed
 *  while a secret rotates). Checked on the raw bytes, in constant time, within 5 minutes. */
export function verifySignature(secret: string, header: string | null, rawBody: string, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !header) return false
  const parts = header.split(',').map((p) => p.trim().split('=') as [string, string])
  const t = Number(parts.find(([k]) => k === 't')?.[1])
  const sigs = parts.filter(([k, v]) => k === 'v1' && /^[0-9a-f]{64}$/i.test(v ?? '')).map(([, v]) => v.toLowerCase())
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowS - t) > REPLAY_WINDOW_S) return false
  const want = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'))
  return sigs.some((s) => { const got = Buffer.from(s); return got.length === want.length && timingSafeEqual(got, want) })
}

export interface PaidEvent {
  event: string
  orderId: string
  paymentLinkId: string | null
  currencyToken: string
  network: string
  amountReceived: string
  transactionId: string
  paidAt: string
  customerReference: string | null
  customerEmail: string | null
}

/** Is this payment a Featured spot? Returns why not, or null when it counts. */
export function featureProblem(e: PaidEvent, c = config()): string | null {
  if (e.event !== 'payment.paid') return 'not a payment'
  if (!c.linkId || e.paymentLinkId !== c.linkId) return 'another payment link'
  if (!ACCEPTED_TOKENS.includes(e.currencyToken as (typeof ACCEPTED_TOKENS)[number])) return `paid in ${e.currencyToken}`
  // NervixPay randomises the last decimals of the payable amount; anything below 9.99 is short.
  if (!(Number(e.amountReceived) >= FEATURE_USD - 0.01)) return `amount ${e.amountReceived} is below ${FEATURE_USD}`
  if (!e.customerReference) return 'no listing reference'
  return null
}

/** A paid Featured spot extends from today, or from the current end date if it hasn't run out. */
export function extendUntil(current: string | null, days: number, now = Date.now()): string {
  const from = current && Date.parse(current) > now ? Date.parse(current) : now
  return new Date(from + days * 86_400_000).toISOString()
}
