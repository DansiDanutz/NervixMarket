import { isFeatured, isGenesis, isVerified, type PublicListing } from './listing'
import { escapeXml } from './xml'

export interface BadgeSnippets {
  svgUrl: string
  pageUrl: string
  markdown: string
  html: string
}

/** Generate embeddable Markdown & HTML snippets pointing back to the listing's Nervix Space page. */
export function badgeSnippets(slug: string, name: string, baseUrl: string): BadgeSnippets {
  const base = baseUrl.replace(/\/$/, '')
  const safeSlug = encodeURIComponent(slug)
  const svgUrl = `${base}/api/badge/${safeSlug}`
  const pageUrl = `${base}/l/${safeSlug}`
  const alt = `${name} on Nervix Space`
  const mdAlt = alt.replace(/[\[\]]/g, '')
  return {
    svgUrl,
    pageUrl,
    markdown: `[![${mdAlt}](${svgUrl})](${pageUrl})`,
    html: `<a href="${escapeXml(pageUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeXml(svgUrl)}" alt="${escapeXml(alt)}" height="28" /></a>`,
  }
}

/** Crisp, zero-dependency SVG badge matching Nervix Space's Live Network dark palette. */
export function renderBadgeSvg(
  listing: Pick<PublicListing, 'name' | 'founding' | 'featured_until' | 'verified_at' | 'genesis_number'>,
  now = Date.now(),
): string {
  const status = listing.founding
    ? { label: 'Founding', accent: '#22d3ee', bg: '#0c2430' }
    : isFeatured(listing, now)
      ? { label: 'Featured', accent: '#c4b5fd', bg: '#1e163b' }
      : isVerified(listing)
        ? { label: 'Verified', accent: '#2de2c4', bg: '#0b2b27' }
        : isGenesis(listing)
          ? { label: 'Genesis 200', accent: '#ffb547', bg: '#261c0b' }
          : { label: 'Listed', accent: '#2de2c4', bg: '#0d2626' }

  const leftText = 'Nervix Space'
  const rightText = status.label
  const leftW = 114
  const rightW = Math.max(66, rightText.length * 7.6 + 22)
  const totalW = Math.round(leftW + rightW)
  const aria = `${listing.name} — ${rightText} on Nervix Space`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="28" viewBox="0 0 ${totalW} 28" role="img" aria-label="${escapeXml(aria)}">`,
    `  <title>${escapeXml(aria)}</title>`,
    '  <defs>',
    '    <linearGradient id="ns-p" x1="0" y1="0" x2="1" y2="1">',
    '      <stop offset="0%" stop-color="#a78bfa"/>',
    '      <stop offset="100%" stop-color="#22d3ee"/>',
    '    </linearGradient>',
    `    <clipPath id="ns-r"><rect width="${totalW}" height="28" rx="7" fill="#fff"/></clipPath>`,
    '  </defs>',
    '  <g clip-path="url(#ns-r)">',
    `    <rect width="${leftW}" height="28" fill="#0b0d1c"/>`,
    `    <rect x="${leftW}" width="${Math.round(rightW)}" height="28" fill="${status.bg}"/>`,
    `    <rect x="${leftW}" width="1" height="28" fill="rgba(190,200,255,0.2)"/>`,
    '  </g>',
    `  <rect x="0.5" y="0.5" width="${totalW - 1}" height="27" rx="6.5" fill="none" stroke="rgba(190,200,255,0.26)"/>`,
    '  <g transform="translate(8,4) scale(0.625)">',
    '    <circle cx="16" cy="16" r="8.5" fill="url(#ns-p)"/>',
    '    <ellipse cx="16" cy="16" rx="14.5" ry="5.2" fill="none" stroke="#e8e6ff" stroke-width="1.8" transform="rotate(-24 16 16)"/>',
    '    <circle cx="28.4" cy="10.6" r="2.2" fill="#e8e6ff"/>',
    '  </g>',
    '  <g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Inter,system-ui,sans-serif" font-size="12" font-weight="600">',
    `    <text x="33" y="18" fill="#eef0fb">${escapeXml(leftText)}</text>`,
    `    <text x="${Math.round(leftW + rightW / 2)}" y="18" fill="${status.accent}" text-anchor="middle">${escapeXml(rightText)}</text>`,
    '  </g>',
    '</svg>',
  ].join('\n')
}
