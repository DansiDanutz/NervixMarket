import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/http'
import { cleanPayLink } from '@/lib/listing'
import { findLive, store } from '@/lib/store'

export const dynamic = 'force-dynamic'

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Privacy-safe outbound click redirect for listing Visit / NervixPay buttons.
 *  Never accepts arbitrary destinations — only redirects to the listing's own stored website or verified pay_link. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!SLUG.test(slug)) {
    return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE_HEADERS })
  }
  const listing = await findLive(slug)
  if (!listing) {
    return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE_HEADERS })
  }

  const to = new URL(req.url).searchParams.get('to')
  let dest: string | null = null
  let kind: 'visit_clicks' | 'pay_clicks' = 'visit_clicks'

  if (to === 'pay') {
    dest = listing.pay_link ? cleanPayLink(listing.pay_link) : null
    kind = 'pay_clicks'
  } else {
    dest = listing.website && listing.website.startsWith('https://') ? listing.website : null
    kind = 'visit_clicks'
  }

  if (!dest) {
    return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE_HEADERS })
  }

  if (!listing.founding) {
    await store().recordMetric(listing.id, kind).catch(() => {})
  }

  return NextResponse.redirect(dest, {
    status: 302,
    headers: {
      ...NO_STORE_HEADERS,
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': kind === 'pay_clicks' ? 'no-referrer' : 'strict-origin-when-cross-origin',
    },
  })
}
