import { NextResponse } from 'next/server'
import { siteUrl } from '@/lib/owner'
import { browse } from '@/lib/store'
import { renderRssFeed } from '@/lib/xml'

export const dynamic = 'force-dynamic'

/** RSS 2.0 feed of live AI projects on Nervix Space. */
export async function GET() {
  const base = siteUrl()
  const { items } = await browse({}, 1)
  const xml = renderRssFeed(items, base)
  return new NextResponse(xml, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=600',
      'x-content-type-options': 'nosniff',
    },
  })
}
