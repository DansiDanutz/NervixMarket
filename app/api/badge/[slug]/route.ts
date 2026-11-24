import { NextResponse } from 'next/server'
import { renderBadgeSvg } from '@/lib/badge'
import { findLive, store } from '@/lib/store'

export const dynamic = 'force-dynamic'

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Embeddable SVG badge for any live Nervix Space listing (README, landing page, docs). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!SLUG.test(slug)) {
    return new NextResponse('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  }
  const listing = await findLive(slug)
  if (!listing) {
    return new NextResponse('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  }
  if (!listing.founding) {
    await store().recordMetric(listing.id, 'badge_loads').catch(() => {})
  }
  const svg = renderBadgeSvg(listing)
  return new NextResponse(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=600',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  })
}
