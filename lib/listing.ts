/** A listing in Nervix Space, and the rules for creating one. No dependencies: shared by the
 *  API routes, the pages and the tests. */

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

export type Status = 'pending' | 'active' | 'hidden'

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
  /** Private: receipts and renewal reminders. Never shown or returned publicly. */
  owner_email: string
  status: Status
  paid_until: string | null
  created_at: string
  /** NervixPay order ids already counted (webhook retries are no-ops). */
  orders: string[]
  /** DansLab's own projects, shown first and not paid through the form. */
  founding?: boolean
}

export type PublicListing = Omit<Listing, 'owner_email' | 'orders'>

export const toPublic = ({ owner_email: _e, orders: _o, ...rest }: Listing): PublicListing => rest

export interface ListingInput {
  name: string; tagline: string; description: string; category: string; offer: string
  price?: string; website: string; contact: string; logo?: string; owner_email: string
}

const LIMITS = { name: 60, tagline: 90, description: 2000, price: 60, website: 300, contact: 120, logo: 300, owner_email: 200 }

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'listing'

const isHttps = (u: string) => { try { return new URL(u).protocol === 'https:' } catch { return false } }
const isEmail = (e: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e)

/** Clean and check a submitted listing. Returns the fields, or the errors by field. */
export function validate(raw: Partial<Record<keyof ListingInput, unknown>>):
  { ok: true; value: ListingInput } | { ok: false; errors: Record<string, string> } {
  const str = (k: keyof ListingInput) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '')
  const v: ListingInput = {
    name: str('name'), tagline: str('tagline'), description: str('description'), category: str('category'),
    offer: str('offer'), price: str('price'), website: str('website'), contact: str('contact'), logo: str('logo'),
    owner_email: str('owner_email').toLowerCase(),
  }
  const e: Record<string, string> = {}
  for (const [k, max] of Object.entries(LIMITS)) if ((v[k as keyof ListingInput] ?? '').length > max) e[k] = `At most ${max} characters.`
  if (v.name.length < 2) e.name = 'Give your project a name.'
  if (v.tagline.length < 8) e.tagline = 'One line on what it does.'
  if (v.description.length < 40) e.description = 'Describe it in at least a couple of sentences.'
  if (!CATEGORIES.some((c) => c.id === v.category)) e.category = 'Pick a category.'
  if (!OFFERS.some((o) => o.id === v.offer)) e.offer = 'Can people use it, buy it, or both?'
  if (!isHttps(v.website)) e.website = 'A https:// link to the project.'
  if (v.logo && !isHttps(v.logo)) e.logo = 'A https:// image link, or leave it empty.'
  if (v.contact.length < 3) e.contact = 'How buyers reach you (email, Telegram, X…).'
  if (!isEmail(v.owner_email)) e.owner_email = 'Your email, for the receipt (never shown).'
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, value: v }
}

/** The first FREE_SPOTS projects join for free, for good: their listing goes live at once and is
 *  marked by a paid_until far in the future (no schema change). Listing FREE_SPOTS+1 onwards pays the membership. */
export const FREE_SPOTS = 200
/** Override with the FREE_SPOTS env var (0 switches free spots off). */
export const freeSpots = () => { const n = Number(process.env.FREE_SPOTS); return Number.isFinite(n) && process.env.FREE_SPOTS !== undefined && process.env.FREE_SPOTS !== '' ? n : FREE_SPOTS }
export const FREE_UNTIL = '2999-12-31T00:00:00.000Z'
export const isFree = (l: Pick<Listing, 'paid_until'>) => l.paid_until === FREE_UNTIL

export const isLive = (l: Pick<Listing, 'status' | 'paid_until' | 'founding'>, now = Date.now()) =>
  l.status === 'active' && (!!l.founding || (!!l.paid_until && Date.parse(l.paid_until) > now))

export interface Query { q?: string; category?: string; offer?: string }

/** Public search: live listings only, every word must match, founding projects first, then newest. */
export function search<T extends PublicListing>(all: T[], { q, category, offer }: Query, now = Date.now()): T[] {
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return all
    .filter((l) => isLive(l, now))
    .filter((l) => !category || l.category === category)
    .filter((l) => !offer || l.offer === offer || (offer !== 'both' && l.offer === 'both'))
    .filter((l) => { const h = `${l.name} ${l.tagline} ${l.description} ${l.price}`.toLowerCase(); return words.every((w) => h.includes(w)) })
    .sort((a, b) => Number(!!b.founding) - Number(!!a.founding) || b.created_at.localeCompare(a.created_at))
}
