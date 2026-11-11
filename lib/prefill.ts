import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/** Quick listing: read a project's own page and suggest the name, one-liner, description and logo.
 *  Only public https sites on port 443; private and internal addresses are refused before connecting
 *  (and again on every redirect). Reads at most MAX_BYTES of HTML, within TIMEOUT_MS. */

const MAX_BYTES = 400_000
const TIMEOUT_MS = 5000
const MAX_REDIRECTS = 3

export interface Prefill { name: string; tagline: string; description: string; logo: string; website: string }

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  }
  if (v === 6) {
    const s = ip.toLowerCase()
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s)
    if (mapped) return isPrivateIp(mapped[1])
    return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('ff') || s.startsWith('64:ff9b') || s.startsWith('2001:db8')
  }
  return true
}

type Resolver = (host: string) => Promise<string[]>
const dnsResolve: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address)

/** Throws unless the URL is a public https address. */
export async function assertPublic(u: URL, resolve: Resolver = dnsResolve) {
  if (u.protocol !== 'https:') throw new Error('Only https:// links.')
  if (u.port && u.port !== '443') throw new Error('Only the standard https port.')
  if (u.username || u.password) throw new Error('No credentials in the link.')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (/(^|\.)(localhost|local|internal|home\.arpa)$/i.test(host)) throw new Error('That address is not public.')
  const ips = isIP(host) ? [host] : await resolve(host).catch(() => { throw new Error('That site could not be found.') })
  if (!ips.length || ips.some(isPrivateIp)) throw new Error('That address is not public.')
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

export async function prefill(raw: string, opts: { fetch?: typeof fetch; resolve?: Resolver } = {}): Promise<Prefill> {
  const f = opts.fetch ?? fetch
  let u: URL
  try { u = new URL(raw.trim()) } catch { throw new Error('Paste a full https:// link.') }
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
      if (!r.ok) throw new Error(`The site answered ${r.status}.`)
      if (!/html/i.test(r.headers.get('content-type') ?? '')) throw new Error('That link is not a web page.')
      return parseMeta(await readCapped(r), u.toString())
    }
    throw new Error('Too many redirects.')
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('The site took too long to answer.')
    throw e
  } finally { clearTimeout(timer) }
}
