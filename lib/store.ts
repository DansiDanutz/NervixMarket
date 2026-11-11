import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { extendUntil } from './nervixpay'
import { FOUNDING } from './founding'
import {
  PAGE_SIZE, isFeatured, isLive, matches, offerMatches, slugify, toPublic,
  type Listing, type ListingInput, type ListingPatch, type PublicListing, type Query, type Status,
} from './listing'

/** Where listings live. Production: Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, schema in
 *  supabase/schema.sql), reached server-side only. Without it: a JSON file under .data/ (local dev). */
export interface Store {
  kind: 'supabase' | 'file'
  create(input: ListingInput, meta: { edit_token_hash: string; ip_hash: string }): Promise<Listing>
  get(id: string): Promise<Listing | null>
  bySlug(slug: string): Promise<Listing | null>
  /** Live listings matching the query: featured first, then newest. Founding projects are not included. */
  search(q: Query, limit: number, offset: number): Promise<{ items: Listing[]; total: number }>
  /** Owner edits and status changes. Returns the updated listing. */
  update(id: string, patch: Partial<ListingPatch> & { status?: Status; edit_token_hash?: string }): Promise<Listing | null>
  /** Listings created from this IP hash since the given time (the rate limit). */
  recentByIp(ipHash: string, sinceIso: string): Promise<number>
  /** One report per IP per listing; at `threshold` reports a live listing is hidden for review. Returns the count. */
  report(id: string, ipHash: string, threshold: number): Promise<number>
  /** Remember a Featured payment and extend featured_until, atomically. Null if the order was already counted. */
  settleFeature(orderId: string, listingId: string, detail: Record<string, unknown>, days: number): Promise<string | null>
  /** The owner's listings (to re-send lost manage links). */
  byEmail(email: string): Promise<Listing[]>
}

export const newId = () => `lst_${randomBytes(9).toString('base64url')}`
const now = () => new Date().toISOString()

function fresh(input: ListingInput, meta: { edit_token_hash: string; ip_hash: string }, taken: (slug: string) => boolean): Listing {
  const id = newId()
  let slug = slugify(input.name)
  if (taken(slug) || FOUNDING.some((f) => f.slug === slug)) slug = `${slug}-${id.slice(-5).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`
  return {
    id, slug, name: input.name, tagline: input.tagline, description: input.description,
    category: input.category as Listing['category'], offer: input.offer as Listing['offer'], price: input.price,
    website: input.website, contact: input.contact, logo: input.logo, owner_email: input.owner_email,
    pay_link: input.pay_link, pay_mode: input.pay_mode as Listing['pay_mode'], featured_until: null,
    status: 'active', created_at: now(), orders: [], ...meta,
  }
}

type FileData = { listings: Listing[]; payments: Record<string, unknown>; reports: Record<string, string[]> }

export class FileStore implements Store {
  kind = 'file' as const
  constructor(private file = path.join(process.cwd(), '.data', 'listings.json')) {}
  private async load(): Promise<FileData> {
    try { return { payments: {}, reports: {}, ...JSON.parse(await fs.readFile(this.file, 'utf8')) } } catch { return { listings: [], payments: {}, reports: {} } }
  }
  private async save(d: FileData) {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(d, null, 1))
    await fs.rename(tmp, this.file)
  }
  async create(input: ListingInput, meta: { edit_token_hash: string; ip_hash: string }) {
    const d = await this.load()
    const l = fresh(input, meta, (s) => d.listings.some((x) => x.slug === s))
    d.listings.push(l)
    await this.save(d)
    return l
  }
  async get(id: string) { return (await this.load()).listings.find((l) => l.id === id) ?? null }
  async bySlug(slug: string) { return (await this.load()).listings.find((l) => l.slug === slug) ?? null }
  async search({ q, category, offer }: Query, limit: number, offset: number) {
    const t = Date.now()
    const all = (await this.load()).listings
      .filter((l) => isLive(l) && (!category || l.category === category) && offerMatches(l, offer) && matches(l, q))
      .sort((a, b) => Number(isFeatured(b, t)) - Number(isFeatured(a, t)) || b.created_at.localeCompare(a.created_at))
    return { items: all.slice(offset, offset + limit), total: all.length }
  }
  async update(id: string, patch: Partial<Listing>) {
    const d = await this.load()
    const l = d.listings.find((x) => x.id === id)
    if (!l) return null
    Object.assign(l, patch)
    await this.save(d)
    return l
  }
  async recentByIp(ipHash: string, sinceIso: string) {
    return (await this.load()).listings.filter((l) => l.ip_hash === ipHash && l.created_at > sinceIso).length
  }
  async report(id: string, ipHash: string, threshold: number) {
    const d = await this.load()
    const l = d.listings.find((x) => x.id === id)
    if (!l) return 0
    const by = (d.reports[id] ??= [])
    if (!by.includes(ipHash)) {
      by.push(ipHash)
      if (by.length >= threshold && l.status === 'active') l.status = 'hidden'
      await this.save(d)
    }
    return by.length
  }
  async settleFeature(orderId: string, listingId: string, detail: Record<string, unknown>, days: number) {
    const d = await this.load()
    if (d.payments[orderId]) return null
    const l = d.listings.find((x) => x.id === listingId)
    if (!l) throw new Error('unknown listing')
    const until = extendUntil(l.featured_until, days)
    d.payments[orderId] = { listingId, ...detail, at: now() }
    l.orders = [...l.orders, orderId]
    l.featured_until = until
    await this.save(d)
    return until
  }
  async byEmail(email: string) {
    return (await this.load()).listings.filter((l) => l.owner_email === email && l.status !== 'removed')
  }
}

export class SupabaseStore implements Store {
  kind = 'supabase' as const
  constructor(private url: string, private key: string, private f: typeof fetch = fetch) {}
  private headers(extra: Record<string, string> = {}) {
    return {
      apikey: this.key,
      // new-style keys (sb_secret_…) go only in apikey; legacy JWT keys also need the bearer header
      ...(this.key.startsWith('sb_') ? {} : { authorization: `Bearer ${this.key}` }),
      'content-type': 'application/json', ...extra,
    }
  }
  private base = () => `${this.url.replace(/\/$/, '')}/rest/v1/`
  private async rest(p: string, init: RequestInit = {}, prefer?: string) {
    const r = await this.f(`${this.base()}${p}`, { ...init, cache: 'no-store', headers: this.headers(prefer ? { prefer } : {}) })
    if (!r.ok) { const e = new Error(`database ${r.status}: ${(await r.text()).slice(0, 200)}`); (e as Error & { status?: number }).status = r.status; throw e }
    const t = await r.text()
    return t ? JSON.parse(t) : null
  }
  private one = async (q: string) => ((await this.rest(`listings?${q}&limit=1`)) as Listing[])[0] ?? null
  async create(input: ListingInput, meta: { edit_token_hash: string; ip_hash: string }) {
    const base = slugify(input.name)
    const taken = !!(await this.one(`select=id&slug=eq.${encodeURIComponent(base)}`))
    const insert = async (l: Listing) => ((await this.rest('listings', { method: 'POST', body: JSON.stringify(l) }, 'return=representation')) as Listing[])[0]
    try {
      return await insert(fresh(input, meta, () => taken))
    } catch (e) {
      // two people took the same name at the same moment: the unique slug refused one; give it a suffix
      if ((e as { status?: number }).status === 409) return await insert(fresh(input, meta, () => true))
      throw e
    }
  }
  get = (id: string) => this.one(`select=*&id=eq.${encodeURIComponent(id)}`)
  bySlug = (slug: string) => this.one(`select=*&slug=eq.${encodeURIComponent(slug)}`)
  async search({ q, category, offer }: Query, limit: number, offset: number) {
    const r = await this.rest('rpc/search_listings', {
      method: 'POST',
      body: JSON.stringify({ p_q: q ?? '', p_category: category ?? '', p_offer: offer ?? '', p_limit: limit, p_offset: offset }),
    }) as { items: Listing[]; total: number }
    return { items: r?.items ?? [], total: Number(r?.total ?? 0) }
  }
  async update(id: string, patch: Partial<Listing>) {
    const rows = await this.rest(`listings?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: now() }),
    }, 'return=representation') as Listing[]
    return rows[0] ?? null
  }
  async recentByIp(ipHash: string, sinceIso: string) {
    const r = await this.f(`${this.base()}listings?select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gt.${encodeURIComponent(sinceIso)}&limit=1`, {
      method: 'HEAD', cache: 'no-store', headers: this.headers({ prefer: 'count=exact' }),
    })
    if (!r.ok) throw new Error(`database ${r.status}`)
    return Number((r.headers.get('content-range') ?? '*/0').split('/')[1]) || 0
  }
  async report(id: string, ipHash: string, threshold: number) {
    return Number(await this.rest('rpc/report_listing', {
      method: 'POST', body: JSON.stringify({ p_listing_id: id, p_ip_hash: ipHash, p_threshold: threshold }),
    })) || 0
  }
  async settleFeature(orderId: string, listingId: string, detail: Record<string, unknown>, days: number) {
    return await this.rest('rpc/settle_market_feature', {
      method: 'POST', body: JSON.stringify({ p_order_id: orderId, p_listing_id: listingId, p_detail: detail, p_days: days }),
    }) as string | null
  }
  async byEmail(email: string) {
    return await this.rest(`listings?select=*&owner_email=eq.${encodeURIComponent(email)}&status=neq.removed&limit=20`) as Listing[]
  }
}

let cached: Store | null = null
export function store(): Store {
  if (cached) return cached
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env
  cached = url && key ? new SupabaseStore(url, key) : new FileStore()
  return cached
}
export const setStore = (s: Store | null) => { cached = s }

export interface Page { items: PublicListing[]; total: number; page: number; pages: number }

/** One page of the public directory. Page 1 starts with DansLab's founding projects that match. */
export async function browse(q: Query, page = 1): Promise<Page> {
  const p = Number.isInteger(page) && page > 0 && page < 10_000 ? page : 1
  const founding = FOUNDING.filter((f) => (!q.category || f.category === q.category) && offerMatches(f, q.offer) && matches(f, q.q))
  let res: { items: Listing[]; total: number } = { items: [], total: 0 }
  try { res = await store().search(q, PAGE_SIZE, (p - 1) * PAGE_SIZE) } catch (e) { console.error('listings unavailable', e) }
  return {
    items: [...(p === 1 ? founding : []), ...res.items].map(toPublic),
    total: founding.length + res.total,
    page: p,
    pages: Math.max(1, Math.ceil(res.total / PAGE_SIZE)),
  }
}

/** A public listing by slug: founding projects, then live listings. */
export async function findLive(slug: string): Promise<Listing | null> {
  const f = FOUNDING.find((x) => x.slug === slug)
  if (f) return f
  try {
    const l = await store().bySlug(slug)
    return l && isLive(l) ? l : null
  } catch (e) { console.error('listing unavailable', e); return null }
}
