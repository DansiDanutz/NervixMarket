import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/http'
import { isFeatured, isLive, isVerified, toPublic } from '@/lib/listing'
import { ipHash, refresh, tokenMatches } from '@/lib/owner'
import { RateLimiter } from '@/lib/rate-limit'
import { store } from '@/lib/store'
import { verifySiteOwnership } from '@/lib/verify'

export const dynamic = 'force-dynamic'

const ID = /^lst_[A-Za-z0-9_-]{6,20}$/
const verifyLimiter = new RateLimiter(6, 15 * 60 * 1000)

/** Owner-initiated 1-click site verification: fetches the listing's website via the SSRF-hardened fetcher
 *  and awards a Verified trust mark when a Nervix Space badge, listing link, or nervix-verify meta tag is found. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.VERCEL && store().kind === 'file') {
    return NextResponse.json({ error: 'Verification service is temporarily unavailable.' }, { status: 503, headers: NO_STORE_HEADERS })
  }
  const { id } = await params
  if (!ID.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE_HEADERS })

  try {
    const l = await store().get(id)
    if (!l || l.status === 'removed') {
      return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE_HEADERS })
    }
    if (!tokenMatches(req.headers.get('x-manage-token'), l.edit_token_hash)) {
      return NextResponse.json({ error: 'This manage link is not valid.' }, { status: 403, headers: NO_STORE_HEADERS })
    }

    const lim = verifyLimiter.take(`${ipHash(req)}:${id}`)
    if (!lim.ok) {
      return NextResponse.json(
        { error: `Too many verification checks. Please wait ${lim.retryAfterS} seconds and try again.` },
        { status: 429, headers: { ...NO_STORE_HEADERS, 'retry-after': String(lim.retryAfterS) } },
      )
    }

    const res = await verifySiteOwnership(l)
    if (!res.verified) {
      return NextResponse.json({ ok: false, verified: false, reason: res.reason }, { status: 200, headers: NO_STORE_HEADERS })
    }

    const verifiedAt = new Date().toISOString()
    const updated = await store().update(id, { verified_at: verifiedAt })
    if (!updated) {
      return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE_HEADERS })
    }
    await refresh('/', `/l/${l.slug}`, `/api/badge/${l.slug}`)
    return NextResponse.json(
      {
        ok: true,
        verified: isVerified(updated),
        verified_at: updated.verified_at,
        method: res.method,
        checked_url: res.checkedUrl,
        listing: { ...toPublic(updated), live: isLive(updated), featured: isFeatured(updated), verified: isVerified(updated) },
      },
      { status: 200, headers: NO_STORE_HEADERS },
    )
  } catch (err) {
    console.error('site verification failed', id, err)
    return NextResponse.json({ error: 'Verification check is temporarily unavailable. Please try again shortly.' }, { status: 503, headers: NO_STORE_HEADERS })
  }
}
