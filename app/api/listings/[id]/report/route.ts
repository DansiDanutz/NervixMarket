import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/http'
import { ipHash, refresh } from '@/lib/owner'
import { RateLimiter } from '@/lib/rate-limit'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Distinct reports (one per IP) that hide a listing until an admin reviews it (REPORTS_TO_HIDE). */
const threshold = () => { const n = Number(process.env.REPORTS_TO_HIDE); return Number.isInteger(n) && n > 0 ? n : 5 }
const reportLimiter = new RateLimiter(15, 60 * 60 * 1000)

/** Anyone can flag a listing as spam, a scam or broken. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.VERCEL && store().kind === 'file') {
    return NextResponse.json({ error: 'Reporting is temporarily unavailable.' }, { status: 503, headers: NO_STORE_HEADERS })
  }
  const { id } = await params
  if (!/^lst_[A-Za-z0-9_-]{6,20}$/.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE_HEADERS })
  const ip = ipHash(req)
  const lim = reportLimiter.take(ip)
  if (!lim.ok) {
    return NextResponse.json(
      { error: 'Too many reports. Please try again later.' },
      { status: 429, headers: { ...NO_STORE_HEADERS, 'retry-after': String(lim.retryAfterS) } },
    )
  }
  try {
    const l = await store().get(id)
    if (!l || l.status !== 'active') return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE_HEADERS })
    const n = await store().report(id, ip, threshold())
    if (n >= threshold()) {
      console.warn('listing hidden after reports', id, l.slug)
      await refresh('/', `/l/${l.slug}`, '/sitemap.xml')
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error('listing report failed', id, err)
    return NextResponse.json({ error: 'Unable to submit report right now.' }, { status: 503, headers: NO_STORE_HEADERS })
  }
}
