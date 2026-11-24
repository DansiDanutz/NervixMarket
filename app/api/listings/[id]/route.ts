import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS, readJsonBody } from '@/lib/http'
import { EDITABLE, isFeatured, isLive, isVerified, toPublic, validate, type Listing, type ListingPatch } from '@/lib/listing'
import { refresh, tokenMatches } from '@/lib/owner'
import { EMPTY_METRICS, store } from '@/lib/store'
import { isSameSiteHost } from '@/lib/verify'

export const dynamic = 'force-dynamic'

const ID = /^lst_[A-Za-z0-9_-]{6,20}$/
const MAX_BODY_BYTES = 32_768
const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE_HEADERS })
const unavailable = () => NextResponse.json({ error: 'Listing service is temporarily unavailable. Please try again shortly.' }, { status: 503, headers: NO_STORE_HEADERS })
type Ctx = { params: Promise<{ id: string }> }

/** One listing's public state (the Featured page polls this until the payment lands).
 *  With the owner's `x-manage-token`, also the private bits the owner may edit. */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID.test(id)) return notFound()
  try {
    const l = await store().get(id)
    if (!l || l.status === 'removed') return notFound()
    const owner = tokenMatches(req.headers.get('x-manage-token'), l.edit_token_hash)
    if (!owner && l.status === 'hidden') return notFound()
    const metrics = owner ? await store().getMetrics(id, 30).catch(() => EMPTY_METRICS(30)) : undefined
    return NextResponse.json(
      {
        ...toPublic(l),
        live: isLive(l),
        featured: isFeatured(l),
        verified: isVerified(l),
        ...(owner ? { owner_email: l.owner_email, owner: true, metrics } : {}),
      },
      { headers: NO_STORE_HEADERS },
    )
  } catch (err) {
    console.error('listing lookup failed', id, err)
    return unavailable()
  }
}

/** The owner edits the listing, or pauses / resumes it: { ...fields, status?: 'active' | 'paused' }. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (process.env.VERCEL && store().kind === 'file') return unavailable()
  const { id } = await params
  if (!ID.test(id)) return notFound()
  const parsed = await readJsonBody(req, MAX_BODY_BYTES)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: NO_STORE_HEADERS })
  const raw = parsed.data

  try {
    const l = await store().get(id)
    if (!l || l.status === 'removed') return notFound()
    if (!tokenMatches(req.headers.get('x-manage-token'), l.edit_token_hash)) {
      return NextResponse.json({ error: 'This manage link is not valid.' }, { status: 403, headers: NO_STORE_HEADERS })
    }

    const fields: Record<string, unknown> = {}
    for (const k of EDITABLE) if (raw[k] !== undefined) fields[k] = raw[k]
    // Preserve consistency when only one of pay_link or pay_mode is sent in a partial edit.
    const toValidate: Record<string, unknown> = { ...fields }
    if (fields.pay_mode !== undefined && fields.pay_link === undefined) toValidate.pay_link = l.pay_link
    if (fields.pay_link !== undefined && fields.pay_mode === undefined) toValidate.pay_mode = l.pay_mode

    const v = validate(toValidate, { partial: true })
    if (!v.ok) return NextResponse.json({ errors: v.errors }, { status: 422, headers: NO_STORE_HEADERS })

    const patch: Partial<ListingPatch> & { status?: Listing['status']; verified_at?: string | null } = {}
    for (const k of EDITABLE) {
      if (fields[k] !== undefined || (k === 'pay_mode' && fields.pay_link !== undefined)) {
        (patch as Record<string, string>)[k] = v.value[k]
      }
    }
    // Switching to a different website host clears site verification so the Verified badge cannot be spoofed.
    if (patch.website && !isSameSiteHost(patch.website, l.website) && l.verified_at) {
      patch.verified_at = null
    }

    if (raw.status !== undefined) {
      if (raw.status !== 'active' && raw.status !== 'paused') {
        return NextResponse.json({ errors: { status: 'Active or paused.' } }, { status: 422, headers: NO_STORE_HEADERS })
      }
      // a listing hidden by moderation stays hidden until reviewed
      if (l.status === 'hidden') {
        return NextResponse.json({ error: 'This listing is under review.' }, { status: 409, headers: NO_STORE_HEADERS })
      }
      // a paid listing (#201+) cannot self-activate without payment settlement
      if (l.status === 'pending') {
        return NextResponse.json({ error: 'Complete listing payment to publish this listing.' }, { status: 402, headers: NO_STORE_HEADERS })
      }
      patch.status = raw.status
    }

    const updated = await store().update(id, patch)
    if (!updated) return notFound()
    await refresh('/', `/l/${l.slug}`, '/sitemap.xml', '/feed.xml')
    const metrics = await store().getMetrics(id, 30).catch(() => EMPTY_METRICS(30))
    return NextResponse.json(
      {
        ...toPublic(updated),
        live: isLive(updated),
        featured: isFeatured(updated),
        verified: isVerified(updated),
        owner: true,
        owner_email: updated.owner_email,
        metrics,
      },
      { headers: NO_STORE_HEADERS },
    )
  } catch (err) {
    console.error('listing update failed', id, err)
    return unavailable()
  }
}

/** The owner deletes the listing. It disappears everywhere; the slug stays reserved. */
export async function DELETE(req: Request, { params }: Ctx) {
  if (process.env.VERCEL && store().kind === 'file') return unavailable()
  const { id } = await params
  if (!ID.test(id)) return notFound()
  try {
    const l = await store().get(id)
    if (!l || l.status === 'removed') return notFound()
    if (!tokenMatches(req.headers.get('x-manage-token'), l.edit_token_hash)) {
      return NextResponse.json({ error: 'This manage link is not valid.' }, { status: 403, headers: NO_STORE_HEADERS })
    }
    await store().update(id, { status: 'removed', edit_token_hash: '' })
    await refresh('/', `/l/${l.slug}`, '/sitemap.xml', '/feed.xml')
    return NextResponse.json({ ok: true, removed: true }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error('listing delete failed', id, err)
    return unavailable()
  }
}
