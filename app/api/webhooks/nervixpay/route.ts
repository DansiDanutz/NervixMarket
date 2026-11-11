import { NextResponse } from 'next/server'
import { config, featureProblem, verifySignature, type PaidEvent } from '@/lib/nervixpay'
import { refresh } from '@/lib/owner'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** NervixPay's signed `payment.paid` event. A verified 10 USD USDT/USDC payment on the Featured link,
 *  with a listing id as its reference, features that listing for FEATURE_DAYS.
 *  Idempotent by order id: retries answer 200 and change nothing. */
export async function POST(req: Request) {
  const c = config()
  const raw = await req.text()
  if (!verifySignature(c.secret, req.headers.get('x-nervixpay-signature'), raw)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }
  let e: PaidEvent
  try { e = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }) }
  const problem = featureProblem(e, c)
  if (problem) {
    if (e.event === 'payment.paid') console.warn('NervixPay payment not applied', e.orderId, problem)
    return NextResponse.json({ ignored: problem }) // 2xx: nothing to retry
  }
  const s = store()
  const l = await s.get(e.customerReference!)
  if (!l) {
    // paid, but for no listing we know: keep a trace so it can be applied by hand
    console.error('NervixPay payment for unknown listing', e.orderId, e.customerReference, e.amountReceived, e.currencyToken)
    return NextResponse.json({ ignored: 'unknown listing' })
  }
  const until = await s.settleFeature(e.orderId, l.id, {
    token: e.currencyToken, network: e.network, amount: e.amountReceived, tx: e.transactionId, paidAt: e.paidAt,
  }, c.featureDays)
  if (!until) return NextResponse.json({ ok: true, duplicate: true })
  await refresh('/', `/l/${l.slug}`)
  return NextResponse.json({ ok: true, listing: l.slug, featured_until: until })
}
