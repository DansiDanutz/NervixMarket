import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS, readTextBody } from '@/lib/http'
import { config, featureProblem, verifySignature, type PaidEvent } from '@/lib/nervixpay'
import { featuredMail, refresh, sendMail } from '@/lib/owner'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_WEBHOOK_BYTES = 65_536

/** NervixPay's signed `payment.paid` event. A verified 10 USD USDT/USDC payment on the Featured link,
 *  with a listing id as its reference, features that listing for FEATURE_DAYS.
 *  Idempotent by order id: retries answer 200 and change nothing. */
export async function POST(req: Request) {
  if (process.env.VERCEL && store().kind === 'file') {
    return NextResponse.json({ error: 'database not configured' }, { status: 503, headers: NO_STORE_HEADERS })
  }
  const body = await readTextBody(req, MAX_WEBHOOK_BYTES)
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status, headers: NO_STORE_HEADERS })
  const raw = body.text
  const c = config()
  if (!verifySignature(c.secret, req.headers.get('x-nervixpay-signature'), raw)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401, headers: NO_STORE_HEADERS })
  }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad body' }, { status: 400, headers: NO_STORE_HEADERS }) }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return NextResponse.json({ error: 'bad body' }, { status: 400, headers: NO_STORE_HEADERS })
  }
  const e = parsed as PaidEvent
  const problem = featureProblem(e, c)
  if (problem) {
    if (e.event === 'payment.paid') console.warn('NervixPay payment not applied', e.orderId, problem)
    return NextResponse.json({ ignored: problem }, { headers: NO_STORE_HEADERS }) // 2xx: nothing to retry
  }
  try {
    const s = store()
    const l = await s.get(e.customerReference!)
    if (!l) {
      // paid, but for no listing we know: keep a trace so it can be applied by hand
      console.error('NervixPay payment for unknown listing', e.orderId, e.customerReference, e.amountReceived, e.currencyToken)
      return NextResponse.json({ ignored: 'unknown listing' }, { headers: NO_STORE_HEADERS })
    }
    if (l.status === 'removed') {
      console.error('NervixPay payment for removed listing', e.orderId, l.id, e.amountReceived, e.currencyToken)
      return NextResponse.json({ ignored: 'removed listing' }, { headers: NO_STORE_HEADERS })
    }
    const until = await s.settleFeature(e.orderId, l.id, {
      token: e.currencyToken, network: e.network, amount: e.amountReceived, tx: e.transactionId, paidAt: e.paidAt,
    }, c.featureDays)
    if (!until) return NextResponse.json({ ok: true, duplicate: true }, { headers: NO_STORE_HEADERS })
    const mailed = await sendMail(
      l.owner_email,
      `Your Nervix Space Featured spot is live: ${l.name}`,
      featuredMail({
        name: l.name,
        slug: l.slug,
        id: l.id,
        untilIso: until,
        orderId: e.orderId,
        amount: e.amountReceived,
        token: e.currencyToken,
        network: e.network,
      }),
    )
    await refresh('/', `/l/${l.slug}`)
    return NextResponse.json({ ok: true, listing: l.slug, featured_until: until, mailed }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error('NervixPay webhook settlement failed', e.orderId, err)
    return NextResponse.json({ error: 'settlement temporarily unavailable' }, { status: 503, headers: NO_STORE_HEADERS })
  }
}
