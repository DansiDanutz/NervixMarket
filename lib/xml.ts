import { CATEGORIES, type PublicListing } from './listing'

/** Escape XML special characters and strip illegal XML 1.0 control characters. */
export function escapeXml(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const rfc822 = (iso: string): string => {
  const ts = Date.parse(iso)
  return Number.isFinite(ts) ? new Date(ts).toUTCString() : new Date().toUTCString()
}

/** Render a valid RSS 2.0 feed of live Nervix Space listings. */
export function renderRssFeed(listings: PublicListing[], baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '')
  const newest = listings[0]?.created_at
  const lastBuild = newest ? rfc822(newest) : new Date().toUTCString()

  const items = listings.map((l) => {
    const link = `${base}/l/${encodeURIComponent(l.slug)}`
    const cat = CATEGORIES.find((c) => c.id === l.category)?.label ?? l.category
    const summaryParts = [l.tagline, l.price ? `Price: ${l.price}` : '', l.description].filter(Boolean)
    return [
      '    <item>',
      `      <title>${escapeXml(l.name)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `      <pubDate>${rfc822(l.created_at)}</pubDate>`,
      `      <category>${escapeXml(cat)}</category>`,
      `      <description>${escapeXml(summaryParts.join(' — '))}</description>`,
      '    </item>',
    ].join('\n')
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>Nervix Space · Live AI Projects</title>',
    `    <link>${escapeXml(base)}/</link>`,
    `    <atom:link href="${escapeXml(base)}/feed.xml" rel="self" type="application/rss+xml" />`,
    '    <description>New AI ideas, app demos, agents, and production-ready apps listed on Nervix Space.</description>',
    '    <language>en-us</language>',
    `    <lastBuildDate>${lastBuild}</lastBuildDate>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
