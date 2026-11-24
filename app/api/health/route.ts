import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/http'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Lightweight production health check. Verifies database reachability without exposing secrets. */
export async function GET() {
  const s = store()
  const timestamp = new Date().toISOString()
  if (process.env.VERCEL && s.kind === 'file') {
    return NextResponse.json(
      { ok: false, status: 'degraded', store: s.kind, error: 'database not configured', timestamp },
      { status: 503, headers: NO_STORE_HEADERS },
    )
  }
  try {
    await s.search({}, 1, 0)
    return NextResponse.json(
      { ok: true, status: 'ok', store: s.kind, timestamp },
      { status: 200, headers: NO_STORE_HEADERS },
    )
  } catch (err) {
    console.error('health check failed', err)
    return NextResponse.json(
      { ok: false, status: 'degraded', store: s.kind, timestamp },
      { status: 503, headers: NO_STORE_HEADERS },
    )
  }
}
