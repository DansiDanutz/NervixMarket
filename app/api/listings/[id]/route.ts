import { NextResponse } from 'next/server'
import { isLive, toPublic } from '@/lib/listing'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** One listing's public state; the pending page polls this until the payment lands. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^lst_[A-Za-z0-9_-]{6,20}$/.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const l = await store().get(id)
  if (!l || l.status === 'hidden') return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ...toPublic(l), live: isLive(l) })
}
