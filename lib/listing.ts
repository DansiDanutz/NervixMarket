/** A listing in Nervix Space, and the rules for creating one. No dependencies: shared by the
 *  API routes, the pages and the tests.
 *
 *  Listing is free for everyone. A listing can carry the owner's own NervixPay payment link, so people
 *  can buy it or subscribe to it straight from the listing (wallet to wallet, to the owner). The only
 *  paid extra is "Featured": 10 USD in USDT/USDC through Nervix Space's own NervixPay link. */

export const CATEGORIES = [
  { id: 'apps', label: 'AI apps' },
  { id: 'agents', label: 'Agents' },
  { id: 'tools', label: 'Tools & APIs' },
  { id: 'trading', label: 'Trading & finance' },
  { id: 'content', label: 'Content & media' },
  { id: 'business', label: 'Businesses for sale' },
  { id: 'other', label: 'Other' },
] as const
export type Category = (typeof CATEGORIES)[number]['id']

export const OFFERS = [
  { id: 'use', label: 'Use it' },
  { id: 'sell', label: 'For sale' },
  { id: 'both', label: 'Use or buy' },
] as const
export type Offer = (typeof OFFERS)[number]['id']

/** How the owner's NervixPay link is presented on the listing. */
export const PAY_MODES = [
  { id: 'buy', label: 'Buy', button: 'Buy with NervixPay' },
  { id: 'subscribe', label: 'Subscription', button: 'Subscribe with NervixPay' },
] as const
export type PayMode = (typeof PAY_MODES)[number]['id']

/** active: public · paused: the owner took it down for now · hidden: moderation · removed: deleted by the owner.
 *  pending only exists on rows from the old paid model. */
export type Status = 'pending' | 'active' | 'paused' | 'hidden' | 'removed'

export interface Listing {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: Category
  offer: Offer
  price: string
  website: string
  contact: string
  logo: string
  /** The owner's own NervixPay payment link (https://nervixpay.live/l/<id>), or ''. */
  pay_link: string
  pay_mode: PayMode | ''
  /** Featured (paid boost) until this date; null when not featured. */
  featured_until: string | null
  status: Status
  created_at: string
  /** Private: the manage link is mailed here. Never shown or returned publicly. */
  owner_email: string
  /** Private: sha256 of the owner's manage token. */
  edit_token_hash: string
  /** Private: salted hash of the submitter's IP, for the rate limit. */
  ip_hash: string
  /** Private: NervixPay order ids already counted for Featured (webhook retries are no-ops). */
  orders: string[]
  /** Legacy (old paid model); unused. */
  paid_until?: string | null
  /** DansLab's own projects, shown first and kept in code. */
  founding?: boolean
}

const PRIVATE = ['owner_email', 'edit_token_hash', 'ip_hash', 'orders', 'paid_until', 'reports', 'search'] as const
export type PublicListing = Omit<Listing, 'owner_email' | 'edit_token_hash' | 'ip_hash' | 'orders' | 'paid_until'>

export const toPublic = (l: Listing): PublicListing => {
  const out = { ...l } as Record<string, unknown>
  for (const k of PRIVATE) delete out[k]
  return out as unknown as PublicListing
}

export interface ListingInput {
  name: string; tagline: string; description: string; category: string; offer: string
  price: string; website: string; contact: string; logo: string; owner_email: string
  pay_link: string; pay_mode: string
}
/** What an owner can change from the manage link (not the email, not the slug). */
export type ListingPatch = Omit<ListingInput, 'owner_email'>
export const EDITABLE: (keyof ListingPatch)[] = ['name', 'tagline', 'description', 'category', 'offer', 'price', 'website', 'contact', 'logo', 'pay_link', 'pay_mode']

const LIMITS: Record<keyof ListingInput, number> = {
  name: 60, tagline: 90, description: 2000, category: 20, offer: 10, price: 60, website: 300, contact: 120,
  logo: 300, owner_email: 200, pay_link: 300, pay_mode: 10,
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'listing'

const isHttps = (u: string) => { try { return new URL(u).protocol === 'https:' } catch { return false } }
const isEmail = (e: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e)

/** Hosts whose payment links are accepted: NervixPay, plus NERVIXPAY_BASE_URL when it points elsewhere (staging). */
export function payHosts(): string[] {
  const hosts = ['nervixpay.live', 'www.nervixpay.live']
  try { if (process.env.NERVIXPAY_BASE_URL) hosts.push(new URL(process.env.NERVIXPAY_BASE_URL).host) } catch { /* ignore */ }
  return hosts
}

/** A NervixPay hosted checkout link, cleaned to https://<host>/l/<id>; null if it isn't one. */
export function cleanPayLink(raw: string, hosts = payHosts()): string | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'https:' || !hosts.includes(u.host) || u.username || u.password) return null
  const m = /^\/l\/([A-Za-z0-9_-]{4,64})\/?$/.exec(u.pathname)
  return m ? `https://${u.host}/l/${m[1]}` : null
}

type Raw = Partial<Record<keyof ListingInput, unknown>>

/** Clean and check a listing. With `partial`, only the fields present are checked (an edit).
 *  Returns the cleaned fields, or the errors by field. */
export function validate(raw: Raw, opts: { partial?: boolean } = {}):
  { ok: true; value: ListingInput } | { ok: false; errors: Record<string, string> } {
  const has = (k: keyof ListingInput) => !opts.partial || raw[k] !== undefined
  const str = (k: keyof ListingInput) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '')
  const v: ListingInput = {
    name: str('name'), tagline: str('tagline'), description: str('description'), category: str('category'),
    offer: str('offer') || 'use', price: str('price'), website: str('website'), contact: str('contact'), logo: str('logo'),
    owner_email: str('owner_email').toLowerCase(), pay_link: str('pay_link'), pay_mode: str('pay_mode'),
  }
  const e: Record<string, string> = {}
  for (const [k, max] of Object.entries(LIMITS)) if (has(k as keyof ListingInput) && v[k as keyof ListingInput].length > max) e[k] = `At most ${max} characters.`
  if (has('name') && v.name.length < 2) e.name = 'Give your project a name.'
  if (has('tagline') && v.tagline.length < 8) e.tagline = 'One line on what it does (8 characters or more).'
  if (has('category') && !CATEGORIES.some((c) => c.id === v.category)) e.category = 'Pick a category.'
  if (has('offer') && !OFFERS.some((o) => o.id === v.offer)) e.offer = 'Can people use it, buy it, or both?'
  if (has('website') && !isHttps(v.website)) e.website = 'A https:// link to the project.'
  if (has('logo') && v.logo && !isHttps(v.logo)) e.logo = 'A https:// image link, or leave it empty.'
  if (has('owner_email') && !isEmail(v.owner_email)) e.owner_email = 'Your email, for your private edit link (never shown).'
  if (has('pay_link')) {
    if (v.pay_link) {
      const clean = cleanPayLink(v.pay_link)
      if (!clean) e.pay_link = 'Paste a NervixPay payment link, like https://nervixpay.live/l/…'
      else v.pay_link = clean
    }
  }
  if (has('pay_mode') || has('pay_link')) {
    if (!v.pay_link) v.pay_mode = ''
    else if (!PAY_MODES.some((m) => m.id === v.pay_mode)) v.pay_mode = 'buy'
  }
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, value: v }
}

export const isLive = (l: Pick<Listing, 'status'>) => l.status === 'active'
export const isFeatured = (l: Pick<Listing, 'featured_until'>, now = Date.now()) =>
  !!l.featured_until && Date.parse(l.featured_until) > now

export const PAGE_SIZE = 36
/** Price of a Featured spot, in USD (USDT/USDC through NervixPay). */
export const FEATURE_USD = 10

export interface Query { q?: string; category?: string; offer?: string }

/** Every word must appear somewhere (as a word prefix, like the database's full-text search). */
export const matches = (l: Pick<Listing, 'name' | 'tagline' | 'description' | 'price'>, q?: string) => {
  const words = (q ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(Boolean)
  if (!words.length) return true
  const tokens = `${l.name} ${l.tagline} ${l.description} ${l.price}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.every((w) => tokens.some((t) => t.startsWith(w)))
}

export const offerMatches = (l: Pick<Listing, 'offer'>, offer?: string) =>
  !offer || l.offer === offer || (offer !== 'both' && l.offer === 'both')

/** Public search: live listings only, founding projects first, then featured, then newest. */
export function search<T extends PublicListing>(all: T[], { q, category, offer }: Query, now = Date.now()): T[] {
  return all
    .filter((l) => isLive(l))
    .filter((l) => !category || l.category === category)
    .filter((l) => offerMatches(l, offer))
    .filter((l) => matches(l, q))
    .sort((a, b) => Number(!!b.founding) - Number(!!a.founding)
      || Number(isFeatured(b, now)) - Number(isFeatured(a, now))
      || b.created_at.localeCompare(a.created_at))
}
