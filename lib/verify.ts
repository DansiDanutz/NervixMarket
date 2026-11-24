import { siteUrl } from './owner'
import { PrefillError, fetchPublicHtml } from './prefill'

export type VerifyMethod = 'badge' | 'backlink' | 'meta'

export type VerifyResult =
  | { verified: true; method: VerifyMethod; checkedUrl: string }
  | { verified: false; reason: string }

const stripWww = (host: string) => host.toLowerCase().replace(/^www\./, '').replace(/\.+$/, '')

/** True when two URLs refer to the same host (allowing apex <-> www redirects only). */
export function isSameSiteHost(a: string, b: string): boolean {
  try {
    return stripWww(new URL(a).hostname) === stripWww(new URL(b).hostname)
  } catch {
    return false
  }
}

/** Exact <meta> tag an owner can paste into <head> as an alternative to embedding the SVG badge. */
export const verifyMetaTag = (id: string) => `<meta name="nervix-verify" content="${id}" />`

const readAttr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? '').trim()
}

/** Pure HTML inspection: checks for a Nervix Space badge, listing backlink, or nervix-verify meta tag. */
export function matchVerificationHtml(
  html: string,
  listing: { id: string; slug: string },
  baseUrl = siteUrl(),
): VerifyMethod | null {
  let siteHost = 'nervix.space'
  try { siteHost = stripWww(new URL(baseUrl).hostname) } catch { /* default */ }
  const allowedHosts = new Set([siteHost, 'nervix.space'])

  const slugEnc = encodeURIComponent(listing.slug).toLowerCase()
  const slugRaw = listing.slug.toLowerCase()
  const badgePaths = new Set([`/api/badge/${slugRaw}`, `/api/badge/${slugEnc}`])
  const pagePaths = new Set([`/l/${slugRaw}`, `/l/${slugEnc}`])

  // 1. Check <img src="..."> pointing at the listing's Nervix Space SVG badge
  const imgs = html.match(/<img\b[^>]*>/gi) ?? []
  for (const tag of imgs) {
    const src = readAttr(tag, 'src')
    if (!src) continue
    try {
      const u = new URL(src)
      const p = u.pathname.replace(/\/+$/, '').toLowerCase()
      if ((u.protocol === 'https:' || u.protocol === 'http:') && allowedHosts.has(stripWww(u.hostname)) && badgePaths.has(p)) {
        return 'badge'
      }
    } catch { /* ignore relative or malformed */ }
  }

  // 2. Check <a href="..."> pointing at the listing's Nervix Space page
  const anchors = html.match(/<a\b[^>]*>/gi) ?? []
  for (const tag of anchors) {
    const href = readAttr(tag, 'href')
    if (!href) continue
    try {
      const u = new URL(href)
      const p = u.pathname.replace(/\/+$/, '').toLowerCase()
      if ((u.protocol === 'https:' || u.protocol === 'http:') && allowedHosts.has(stripWww(u.hostname)) && pagePaths.has(p)) {
        return 'backlink'
      }
    } catch { /* ignore */ }
  }

  // 3. Check <meta name="nervix-verify" content="<id>">
  const metas = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of metas) {
    if (readAttr(tag, 'name').toLowerCase() !== 'nervix-verify') continue
    const content = readAttr(tag, 'content')
    if (content === listing.id || content.toLowerCase() === slugRaw) {
      return 'meta'
    }
  }

  return null
}

/** Fetches the listing's website through the SSRF-hardened fetcher and verifies site ownership. */
export async function verifySiteOwnership(
  listing: { id: string; slug: string; website: string },
  opts: { fetch?: typeof fetch; resolve?: (host: string) => Promise<string[]>; baseUrl?: string } = {},
): Promise<VerifyResult> {
  try {
    const { html, finalUrl } = await fetchPublicHtml(listing.website, opts)
    if (!isSameSiteHost(listing.website, finalUrl)) {
      return {
        verified: false,
        reason: 'Your website redirected to a different domain. Update your Website URL first, then try verifying again.',
      }
    }
    const method = matchVerificationHtml(html, listing, opts.baseUrl)
    if (method) return { verified: true, method, checkedUrl: finalUrl }
    return {
      verified: false,
      reason: `We checked ${finalUrl} but did not find your Nervix Space badge, listing link (/l/${listing.slug}), or nervix-verify meta tag yet.`,
    }
  } catch (e) {
    return {
      verified: false,
      reason: e instanceof PrefillError ? e.message : 'Could not reach your site right now. Please try again shortly.',
    }
  }
}
