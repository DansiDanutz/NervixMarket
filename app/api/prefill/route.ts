import { NextResponse } from 'next/server'
import { prefill } from '@/lib/prefill'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Quick listing: GET /api/prefill?url=https://… suggests the name, one-liner, description and logo
 *  from the project's own page. Only the extracted fields come back, never the page itself. */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url') ?? ''
  if (!url || url.length > 300) return NextResponse.json({ error: 'Paste a full https:// link.' }, { status: 400 })
  try {
    return NextResponse.json(await prefill(url), { headers: { 'cache-control': 'private, max-age=300' } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Could not read that page.' }, { status: 422 })
  }
}
