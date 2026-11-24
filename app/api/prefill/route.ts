import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/http'
import { ipHash } from '@/lib/owner'
import { PrefillError, prefill } from '@/lib/prefill'
import { RateLimiter } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const prefillLimiter = new RateLimiter(20, 60 * 1000)

/** Quick listing: GET /api/prefill?url=https://… suggests the name, one-liner, description and logo
 *  from the project's own page. Only the extracted fields come back, never the page itself. */
export async function GET(req: Request) {
  const lim = prefillLimiter.take(ipHash(req))
  if (!lim.ok) {
    return NextResponse.json(
      { error: 'Too many preview requests. Please wait a moment and try again.' },
      { status: 429, headers: { ...NO_STORE_HEADERS, 'retry-after': String(lim.retryAfterS) } },
    )
  }
  const url = new URL(req.url).searchParams.get('url') ?? ''
  if (!url || url.length > 300) {
    return NextResponse.json({ error: 'Paste a full https:// link.' }, { status: 400, headers: NO_STORE_HEADERS })
  }
  try {
    return NextResponse.json(await prefill(url), { headers: { 'cache-control': 'private, max-age=300' } })
  } catch (e) {
    const message = e instanceof PrefillError ? e.message : 'Could not read that page.'
    return NextResponse.json({ error: message }, { status: 422, headers: NO_STORE_HEADERS })
  }
}
