import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/http'
import { readiness } from '@/lib/readiness'
import { genesisStatus, store } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Production health check. `ok` (and 200 vs 503) means the database is reachable; uptime monitors key on it.
 *  `readiness` says whether the site can take money and mail owners: booleans and warnings, never secret values. */
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
      { ok: true, status: 'ok', store: s.kind, readiness: readiness(await genesisStatus()), timestamp },
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
