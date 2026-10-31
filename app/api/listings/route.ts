import { NextResponse } from 'next/server'
import { search, toPublic, validate } from '@/lib/listing'
import { checkoutUrl } from '@/lib/nervixpay'
import { everything, store } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Search live listings (agents can use this too): ?q=&category=&offer= */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  const found = search((await everything()).map(toPublic), {
    q: p.get('q') ?? undefined, category: p.get('category') ?? undefined, offer: p.get('offer') ?? undefined,
  })
  return NextResponse.json({ count: found.length, listings: found })
}

/** Submit a listing. It stays pending (not public) until its 10 USD membership is paid. */
export async function POST(req: Request) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400 }) }
  const v = validate((body ?? {}) as Record<string, unknown>)
  if (!v.ok) return NextResponse.json({ errors: v.errors }, { status: 422 })
  const l = await store().create(v.value)
  return NextResponse.json({ id: l.id, slug: l.slug, status: l.status, checkout: checkoutUrl(l.id, l.owner_email), pending: `/pending/${l.id}` }, { status: 201 })
}
