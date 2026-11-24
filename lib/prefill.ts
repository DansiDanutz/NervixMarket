import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/** Quick listing: read a project's own page and suggest the name, one-liner, description and logo.
 *  Only public https sites on port 443; private and internal addresses are refused before connecting
 *  (and again on every redirect). Reads at most MAX_BYTES of HTML, within TIMEOUT_MS. */

const MAX_BYTES = 400_000
const MAX_CONTENT_LENGTH = 2_000_000
const TIMEOUT_MS = 5000
const MAX_REDIRECTS = 3

/** Safe user-facing error thrown by prefill validation/fetch steps. */
export class PrefillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrefillError'
  }
}

export interface Prefill { name: string; tagline: string; description: string; logo: string; website: string }

function isPrivateIpv4Octets(a: number, b: number, c: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

function parseIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase()
  const zone = s.indexOf('%')
  if (zone !== -1) s = s.slice(0, zone)
  const v4Match = /:(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  let tail: number[] = []
  if (v4Match) {
    const octets = v4Match[1].split('.').map(Number)
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
    tail = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]]
    s = s.slice(0, v4Match.index)
    if (s === ':') s = '::'
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const parsePart = (part: string) => {
    if (!part) return []
    const items = part.split(':')
    const nums: number[] = []
    for (const item of items) {
      if (!/^[0-9a-f]{1,4}$/.test(item)) return null
      nums.push(parseInt(item, 16))
    }
    return nums
  }
  const left = parsePart(halves[0])
  const right = halves.length === 2 ? parsePart(halves[1]) : []
  if (!left || !right) return null
  const total = left.length + right.length + tail.length
  if (halves.length === 1) {
    return total === 8 ? [...left, ...tail] : null
  }
  if (total >= 8) return null
  return [...left, ...new Array<number>(8 - total).fill(0), ...right, ...tail]
}

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b, c] = ip.split('.').map(Number)
    return isPrivateIpv4Octets(a, b, c)
  }
  if (v === 6) {
    const g = parseIpv6(ip)
    if (!g) return true
    const zeros0to4 = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0
    // Unspecified (::), loopback (::1), legacy IPv4-compatible (::/96)
    if (zeros0to4 && g[5] === 0) return true
    // IPv4-mapped (::ffff:0:0/96) — covers both ::ffff:127.0.0.1 and URL-normalized ::ffff:7f00:1
    if (zeros0to4 && g[5] === 0xffff) {
      return isPrivateIpv4Octets(g[6] >> 8, g[6] & 0xff, g[7] >> 8)
    }
    // IPv4-translated (::ffff:0:0:0/96)
    if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0xffff && g[5] === 0) {
      return isPrivateIpv4Octets(g[6] >> 8, g[6] & 0xff, g[7] >> 8)
    }
    // NAT64 well-known (64:ff9b::/96) and local-use (64:ff9b:1::/48)
    if (g[0] === 0x0064 && g[1] === 0xff9b) return true
    // Discard-only (100::/64)
    if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true
    // Teredo (2001::/32), benchmarking (2001:2::/48), ORCHID (2001:10::/28, 2001:20::/28), docs (2001:db8::/32)
    if (g[0] === 0x2001 && (g[1] === 0 || (g[1] === 2 && g[2] === 0) || (g[1] & 0xfff0) === 0x0010 || (g[1] & 0xfff0) === 0x0020 || g[1] === 0x0db8)) {
      return true
    }
    // 6to4 (2002::/16) embeds IPv4 in groups 1 and 2
    if (g[0] === 0x2002) {
      return isPrivateIpv4Octets(g[1] >> 8, g[1] & 0xff, g[2] >> 8)
    }
    // Unique local (fc00::/7), link-local (fe80::/10), deprecated site-local (fec0::/10), multicast (ff00::/8)
    if ((g[0] & 0xfe00) === 0xfc00) return true
    if ((g[0] & 0xffc0) === 0xfe80) return true
    if ((g[0] & 0xffc0) === 0xfec0) return true
    if ((g[0] & 0xff00) === 0xff00) return true
    return false
  }
  return true
}

type Resolver = (host: string) => Promise<string[]>
const dnsResolve: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address)

/** Throws unless the URL is a public https address. */
export async function assertPublic(u: URL, resolve: Resolver = dnsResolve) {
  if (u.protocol !== 'https:') throw new PrefillError('Only https:// links.')
  if (u.port && u.port !== '443') throw new PrefillError('Only the standard https port.')
  if (u.username || u.password) throw new PrefillError('No credentials in the link.')
  const host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '')
  if (!host || /(^|\.)(localhost|local|internal|home\.arpa|localdomain)$/i.test(host)) {
    throw new PrefillError('That address is not public.')
  }
  const ips = isIP(host) ? [host] : await resolve(host).catch(() => { throw new PrefillError('That site could not be found.') })
  if (!ips.length || ips.some(isPrivateIp)) throw new PrefillError('That address is not public.')
}

const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : '' })
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => { const c = parseInt(n, 16); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : '' })
  .replace(/\s+/g, ' ').trim()

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : ''
}

/** Pull the useful bits out of a page's <head>. */
export function parseMeta(html: string, pageUrl: string): Prefill {
  const head = html.slice(0, MAX_BYTES)
  const metas = head.match(/<meta\b[^>]*>/gi) ?? []
  const meta = (...keys: string[]) => {
    for (const k of keys) for (const t of metas) {
      if ((attr(t, 'property') || attr(t, 'name')).toLowerCase() === k) { const c = attr(t, 'content'); if (c) return c }
    }
    return ''
  }
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '')
  const siteName = meta('og:site_name', 'application-name')
  const ogTitle = meta('og:title', 'twitter:title')
  // "Acme — the best thing" → name "Acme", tagline "the best thing"
  const [first, ...rest] = (ogTitle || title).split(/\s+[|·•—–-]\s+/)
  const name = siteName || first || ''
  const desc = meta('og:description', 'description', 'twitter:description')
  let tagline = desc
  if (rest.length && !siteName) tagline = rest.join(' – ')
  else if (siteName && first && first !== siteName && first.length >= 8) tagline = first

  const abs = (href: string) => { try { const u = new URL(href, pageUrl); return u.protocol === 'https:' ? u.toString() : '' } catch { return '' } }
  const links = head.match(/<link\b[^>]*>/gi) ?? []
  const icon = (rel: RegExp) => { for (const t of links) if (rel.test(attr(t, 'rel'))) { const h = abs(attr(t, 'href')); if (h) return h } return '' }
  const logo = icon(/apple-touch-icon/i) || abs(meta('og:image', 'twitter:image')) || icon(/(^|\s)icon(\s|$)/i)

  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s)
  return {
    name: cut(name, 60), tagline: cut(tagline || desc, 90), description: cut(desc, 2000),
    logo: logo.length <= 300 ? logo : '', website: pageUrl,
  }
}

async function readCapped(r: Response): Promise<string> {
  if (!r.body) return ''
  const reader = r.body.getReader()
  const chunks: Uint8Array[] = []
  let n = 0
  while (n < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value); n += value.length
  }
  reader.cancel().catch(() => {})
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES))
}

export async function fetchPublicHtml(
  raw: string,
  opts: { fetch?: typeof fetch; resolve?: Resolver } = {},
): Promise<{ html: string; finalUrl: string }> {
  const f = opts.fetch ?? fetch
  let u: URL
  try { u = new URL(raw.trim()) } catch { throw new PrefillError('Paste a full https:// link.') }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublic(u, opts.resolve)
      const r = await f(u, {
        redirect: 'manual', signal: ctl.signal,
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'NervixSpaceBot/1.0 (+https://nervix.space)' },
      })
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location')!, u); continue }
      if (!r.ok) throw new PrefillError(`The site answered ${r.status}.`)
      if (!/html/i.test(r.headers.get('content-type') ?? '')) throw new PrefillError('That link is not a web page.')
      const cl = Number(r.headers.get('content-length') ?? '')
      if (Number.isFinite(cl) && cl > MAX_CONTENT_LENGTH) throw new PrefillError('That page is too large to read automatically.')
      return { html: await readCapped(r), finalUrl: u.toString() }
    }
    throw new PrefillError('Too many redirects.')
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new PrefillError('The site took too long to answer.')
    if (e instanceof PrefillError) throw e
    throw new PrefillError('Could not reach that site.')
  } finally { clearTimeout(timer) }
}

export async function prefill(raw: string, opts: { fetch?: typeof fetch; resolve?: Resolver } = {}): Promise<Prefill> {
  const { html, finalUrl } = await fetchPublicHtml(raw, opts)
  return parseMeta(html, finalUrl)
}
