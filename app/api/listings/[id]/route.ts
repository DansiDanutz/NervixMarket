import { NextResponse } from 'next/server'
import { EDITABLE, isFeatured, isLive, toPublic, validate, type Listing, type ListingPatch } from '@/lib/listing'
import { refresh, tokenMatches } from '@/lib/owner'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

const ID = /^lst_[A-Za-z0-9_-]{6,20}$/
const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 })
type Ctx = { params: Promise<{ id: string }> }

/** One listing's public state (the Featured page polls this until the payment lands).
 *  With the owner's `x-manage-token`, also the private bits the owner may edit. */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID.test(id)) return notFound()
  const l = await store().get(id)
  if (!l || l.status === 'removed') return notFound()
  const owner = tokenMatches(req.headers.get('x-manage-token'), l.edit_token_hash)
  if (!owner && l.status === 'hidden') return notFound()
  return NextResponse.json({ ...toPublic(l), live: isLive(l), featured: isFeatured(l), ...(owner ? { owner_email: l.owner_email, owner: true } : {}) })
}

/** The owner edits the listing, or pauses / resumes it: { ...fields, status?: 'active' | 'paused' }. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID.test(id)) return notFound()
  const l = await store().get(id)
  if (!l || l.status === 'removed') return notFound()
  if (!tokenMatches(req.headers.get('x-manage-token'), l.edit_token_hash)) return NextResponse.json({ error: 'This manage link is not valid.' }, { status: 403 })
  let raw: Record<string, unknown>
  try { raw = (await req.json()) ?? {} } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400 }) }

  const fields: Record<string, unknown> = {}
  for (const k of EDITABLE) if (raw[k] !== undefined) fields[k] = raw[k]
  const v = validate(fields, { partial: true })
  if (!v.ok) return NextResponse.json({ errors: v.errors }, { status: 422 })
  const patch: Partial<ListingPatch> & { status?: Listing['status'] } = {}
  for (const k of EDITABLE) if (fields[k] !== undefined || (k === 'pay_mode' && fields.pay_link !== undefined)) (patch as Record<string, string>)[k] = v.value[k]

  if (raw.status !== undefined) {
    if (raw.status !== 'active' && raw.status !== 'paused') return NextResponse.json({ errors: { status: 'Active or paused.' } }, { status: 422 })
    // a listing hidden by moderation stays hidden until reviewed
    if (l.status === 'hidden') return NextResponse.json({ error: 'This listing is under review.' }, { status: 409 })
    patch.status = raw.status
  }
  const updated = await store().update(id, patch)
  await refresh('/', `/l/${l.slug}`)
  return NextResponse.json({ ...toPublic(updated!), live: isLive(updated!), owner: true, owner_email: updated!.owner_email })
}

/** The owner deletes the listing. It disappears everywhere; the slug stays reserved. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID.test(id)) return notFound()
  const l = await store().get(id)
  if (!l || l.status === 'removed') return notFound()
  if (!tokenMatches(req.headers.get('x-manage-token'), l.edit_token_hash)) return NextResponse.json({ error: 'This manage link is not valid.' }, { status: 403 })
  await store().update(id, { status: 'removed', edit_token_hash: '' })
  await refresh('/', `/l/${l.slug}`)
  return NextResponse.json({ ok: true, removed: true })
}
