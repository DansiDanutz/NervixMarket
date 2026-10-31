import { NextResponse } from 'next/server'
import { config, membershipProblem, verifySignature, type PaidEvent } from '@/lib/nervixpay'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** NervixPay's signed `payment.paid` event. A verified 10 USD USDT/USDC payment on the membership
 *  link, with a listing id as its reference, puts that listing live for MEMBERSHIP_DAYS.
 *  Idempotent by order id: retries answer 200 and change nothing. */
export async function POST(req: Request) {
  const c = config()
  const raw = await req.text()
  if (!verifySignature(c.secret, req.headers.get('x-nervixpay-signature'), raw)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }
  let e: PaidEvent
  try { e = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }) }
  const problem = membershipProblem(e, c)
  if (problem) return NextResponse.json({ ignored: problem }) // 2xx: nothing to retry
  const s = store()
  const l = await s.get(e.customerReference!)
  if (!l) return NextResponse.json({ ignored: 'unknown listing' })
  const until = await s.settlePayment(e.orderId, l.id, {
    token: e.currencyToken, network: e.network, amount: e.amountReceived, tx: e.transactionId, paidAt: e.paidAt,
  }, c.membershipDays)
  if (!until) return NextResponse.json({ ok: true, duplicate: true })
  return NextResponse.json({ ok: true, listing: l.slug, paid_until: until })
}
