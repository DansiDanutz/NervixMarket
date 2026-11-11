import { NextResponse } from 'next/server'
import { ipHash, refresh } from '@/lib/owner'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Distinct reports (one per IP) that hide a listing until an admin reviews it (REPORTS_TO_HIDE). */
const threshold = () => { const n = Number(process.env.REPORTS_TO_HIDE); return Number.isInteger(n) && n > 0 ? n : 5 }

/** Anyone can flag a listing as spam, a scam or broken. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^lst_[A-Za-z0-9_-]{6,20}$/.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const l = await store().get(id)
  if (!l || l.status !== 'active') return NextResponse.json({ error: 'not found' }, { status: 404 })
  const n = await store().report(id, ipHash(req), threshold())
  if (n >= threshold()) { console.warn('listing hidden after reports', id, l.slug); await refresh('/', `/l/${l.slug}`) }
  return NextResponse.json({ ok: true })
}
