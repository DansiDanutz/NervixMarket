import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS, readJsonBody } from '@/lib/http'
import { ipHash, isAdmin, refresh } from '@/lib/owner'
import { RateLimiter } from '@/lib/rate-limit'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

const ID = /^lst_[A-Za-z0-9_-]{6,20}$/
const MAX_BODY_BYTES = 4_096
const adminFailLimiter = new RateLimiter(10, 15 * 60 * 1000)

/** Moderation: `Authorization: Bearer <ADMIN_TOKEN>`, body { status: 'active' | 'hidden' | 'removed' }.
 *  Unavailable unless ADMIN_TOKEN (16+ characters) is set. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = ipHash(req)
  const locked = adminFailLimiter.check(ip)
  if (!locked.ok) {
    return NextResponse.json(
      { error: 'Too many failed admin attempts. Try again later.' },
      { status: 429, headers: { ...NO_STORE_HEADERS, 'retry-after': String(locked.retryAfterS) } },
    )
  }
  if (!isAdmin(req)) {
    adminFailLimiter.take(ip)
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS })
  }
  if (process.env.VERCEL && store().kind === 'file') {
    return NextResponse.json({ error: 'database not configured' }, { status: 503, headers: NO_STORE_HEADERS })
  }
  const { id } = await params
  if (!ID.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE_HEADERS })

  const parsed = await readJsonBody(req, MAX_BODY_BYTES)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: NO_STORE_HEADERS })
  const status = parsed.data.status
  if (status !== 'active' && status !== 'hidden' && status !== 'removed') {
    return NextResponse.json({ error: 'status: active, hidden or removed' }, { status: 422, headers: NO_STORE_HEADERS })
  }

  try {
    const l = await store().get(id)
    if (!l) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE_HEADERS })
    const updated = await store().update(id, { status })
    await refresh('/', `/l/${l.slug}`, '/sitemap.xml')
    return NextResponse.json({ id, slug: updated?.slug, status: updated?.status }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error('admin update failed', id, err)
    return NextResponse.json({ error: 'database unavailable' }, { status: 503, headers: NO_STORE_HEADERS })
  }
}
