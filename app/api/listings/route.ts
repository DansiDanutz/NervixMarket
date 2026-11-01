import { NextResponse } from 'next/server'
import { FREE_UNTIL, search, toPublic, validate } from '@/lib/listing'
import { checkoutUrl } from '@/lib/nervixpay'
import { everything, freeLeft, store } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Search live listings (agents can use this too): ?q=&category=&offer= */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  const found = search((await everything()).map(toPublic), {
    q: p.get('q') ?? undefined, category: p.get('category') ?? undefined, offer: p.get('offer') ?? undefined,
  })
  return NextResponse.json({ count: found.length, free_spots_left: await freeLeft(), listings: found })
}

/** Submit a listing. While free spots are left it goes live at once, for free; after that it stays pending
 *  (not public) until its 10 USD membership is paid. */
export async function POST(req: Request) {
  if (process.env.VERCEL && store().kind === 'file') {
    // a hosted site needs the database; the file store is for local development only
    return NextResponse.json({ error: 'Listings open very soon. Please come back in a little while.' }, { status: 503 })
  }
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400 }) }
  const raw = (body ?? {}) as Record<string, unknown>
  // a field people never see: bots fill it in
  if (typeof raw.company === 'string' && raw.company.trim()) return NextResponse.json({ error: 'Unable to save your listing.' }, { status: 400 })
  const v = validate(raw)
  if (!v.ok) return NextResponse.json({ errors: v.errors }, { status: 422 })
  try {
    const free = (await freeLeft()) > 0
    const l = await store().create(v.value)
    if (free) {
      await store().activate(l.id, FREE_UNTIL)
      return NextResponse.json({ id: l.id, slug: l.slug, status: 'active', free: true, page: `/l/${l.slug}`, pending: `/pending/${l.id}` }, { status: 201 })
    }
    return NextResponse.json({ id: l.id, slug: l.slug, status: l.status, checkout: checkoutUrl(l.id, l.owner_email), pending: `/pending/${l.id}` }, { status: 201 })
  } catch (err) {
    console.error('listing submission failed', err)
    return NextResponse.json({ error: 'Unable to save your listing right now. Please try again shortly.' }, { status: 503 })
  }
}
