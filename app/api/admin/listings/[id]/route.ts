import { NextResponse } from 'next/server'
import { isAdmin, refresh } from '@/lib/owner'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Moderation: `Authorization: Bearer <ADMIN_TOKEN>`, body { status: 'active' | 'hidden' | 'removed' }.
 *  Unavailable unless ADMIN_TOKEN (16+ characters) is set. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  let status: unknown
  try { status = ((await req.json()) ?? {}).status } catch { /* fall through */ }
  if (status !== 'active' && status !== 'hidden' && status !== 'removed') return NextResponse.json({ error: 'status: active, hidden or removed' }, { status: 422 })
  const l = await store().get(id)
  if (!l) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const updated = await store().update(id, { status })
  await refresh('/', `/l/${l.slug}`)
  return NextResponse.json({ id, slug: updated?.slug, status: updated?.status })
}
