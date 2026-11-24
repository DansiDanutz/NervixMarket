import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS, readJsonBody } from '@/lib/http'
import { validate } from '@/lib/listing'
import { hashToken, ipHash, manageMail, manageUrl, newToken, refresh, sendMail } from '@/lib/owner'
import { browse, store } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** New listings allowed per IP per hour (LISTINGS_PER_HOUR). */
const perHour = () => { const n = Number(process.env.LISTINGS_PER_HOUR); return Number.isFinite(n) && n > 0 ? n : 5 }
const MAX_BODY_BYTES = 32_768

/** Search live listings (agents can use this too): ?q=&category=&offer=&page= */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  const r = await browse(
    {
      q: p.get('q')?.slice(0, 100) ?? undefined,
      category: p.get('category') ?? undefined,
      offer: p.get('offer') ?? undefined,
    },
    Number(p.get('page') ?? 1),
  )
  return NextResponse.json({ count: r.total, page: r.page, pages: r.pages, listings: r.items })
}

/** Submit a listing. Free for everyone, live at once. Answers with the owner's private manage link
 *  (shown once; also mailed when mail is set up). */
export async function POST(req: Request) {
  if (process.env.VERCEL && store().kind === 'file') {
    // a hosted site needs the database; the file store is for local development only
    return NextResponse.json({ error: 'Listings open very soon. Please come back in a little while.' }, { status: 503, headers: NO_STORE_HEADERS })
  }
  const parsed = await readJsonBody(req, MAX_BODY_BYTES)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: NO_STORE_HEADERS })
  const raw = parsed.data
  // a field people never see: bots fill it in
  if (typeof raw.company === 'string' && raw.company.trim()) {
    return NextResponse.json({ error: 'Unable to save your listing.' }, { status: 400, headers: NO_STORE_HEADERS })
  }
  const v = validate(raw)
  if (!v.ok) return NextResponse.json({ errors: v.errors }, { status: 422, headers: NO_STORE_HEADERS })
  try {
    const ip = ipHash(req)
    if (await store().recentByIp(ip, new Date(Date.now() - 3_600_000).toISOString()) >= perHour()) {
      return NextResponse.json(
        { error: 'You have listed several projects in the last hour. Please try again a little later.' },
        { status: 429, headers: NO_STORE_HEADERS },
      )
    }
    const token = newToken()
    const l = await store().create(v.value, { edit_token_hash: hashToken(token), ip_hash: ip })
    const manage = manageUrl(l.id, token)
    const mailed = await sendMail(l.owner_email, `Your Nervix Space listing: ${l.name}`, manageMail(l.name, manage))
    await refresh('/', '/sitemap.xml', '/feed.xml')
    return NextResponse.json(
      { id: l.id, slug: l.slug, status: l.status, page: `/l/${l.slug}`, manage, mailed },
      { status: 201, headers: NO_STORE_HEADERS },
    )
  } catch (err) {
    console.error('listing submission failed', err)
    return NextResponse.json(
      { error: 'Unable to save your listing right now. Please try again shortly.' },
      { status: 503, headers: NO_STORE_HEADERS },
    )
  }
}
