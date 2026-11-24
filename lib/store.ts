import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { extendUntil } from './nervixpay'
import { FOUNDING } from './founding'
import {
  PAGE_SIZE, isFeatured, isLive, matches, offerMatches, slugify, toPublic,
  type Listing, type ListingInput, type ListingPatch, type PublicListing, type Query, type Status,
} from './listing'

export type MetricKind = 'views' | 'visit_clicks' | 'pay_clicks' | 'mcp_lookups' | 'badge_loads'
export interface MetricTotals {
  views: number
  visit_clicks: number
  pay_clicks: number
  mcp_lookups: number
  badge_loads: number
}
export interface ListingMetrics {
  window_days: number
  totals: MetricTotals
  recent: MetricTotals
}

export const EMPTY_TOTALS = (): MetricTotals => ({ views: 0, visit_clicks: 0, pay_clicks: 0, mcp_lookups: 0, badge_loads: 0 })
export const EMPTY_METRICS = (days = 30): ListingMetrics => ({ window_days: days, totals: EMPTY_TOTALS(), recent: EMPTY_TOTALS() })

/** Where listings live. Production: Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, schema in
 *  supabase/schema.sql), reached server-side only. Without it: a JSON file under .data/ (local dev). */
export interface Store {
  kind: 'supabase' | 'file'
  create(input: ListingInput, meta: { edit_token_hash: string; ip_hash: string }): Promise<Listing>
  get(id: string): Promise<Listing | null>
  bySlug(slug: string): Promise<Listing | null>
  /** Live listings matching the query: featured first, then newest. Founding projects are not included. */
  search(q: Query, limit: number, offset: number): Promise<{ items: Listing[]; total: number }>
  /** Owner edits and status changes. Returns the updated listing, or null when not found / CAS mismatch. */
  update(
    id: string,
    patch: Partial<ListingPatch> & {
      status?: Status
      edit_token_hash?: string
      verified_at?: string | null
      feature_reminder_for?: string | null
    },
    ifTokenHash?: string,
  ): Promise<Listing | null>
  /** Listings created from this IP hash since the given time (the rate limit). */
  recentByIp(ipHash: string, sinceIso: string): Promise<number>
  /** One report per IP per listing; at `threshold` reports a live listing is hidden for review. Returns the count. */
  report(id: string, ipHash: string, threshold: number): Promise<number>
  /** Remember a Featured payment and extend featured_until, atomically. Null if the order was already counted. */
  settleFeature(orderId: string, listingId: string, detail: Record<string, unknown>, days: number): Promise<string | null>
  /** The owner's listings (to re-send lost manage links). */
  byEmail(email: string): Promise<Listing[]>
  /** Increment a privacy-safe daily counter for a DB listing. No-op for unknown/removed listings. */
  recordMetric(listingId: string, kind: MetricKind): Promise<void>
  /** Aggregated all-time + last-N-days counters for a listing (owner manage dashboard). */
  getMetrics(listingId: string, days?: number): Promise<ListingMetrics>
  /** Active listings whose Featured boost ends between `fromIso` and `toIso` and have not been reminded for that cycle. */
  expiringFeatured(fromIso: string, toIso: string): Promise<Listing[]>
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

type FileData = {
  listings: Listing[]
  payments: Record<string, unknown>
  reports: Record<string, string[]>
  metrics: Record<string, Record<string, Partial<MetricTotals>>>
}

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10)

export class FileStore implements Store {
  kind = 'file' as const
  constructor(private file = path.join(process.cwd(), '.data', 'listings.json')) {}
  private async load(): Promise<FileData> {
    try { return { payments: {}, reports: {}, metrics: {}, ...JSON.parse(await fs.readFile(this.file, 'utf8')) } } catch { return { listings: [], payments: {}, reports: {}, metrics: {} } }
  }
  private async save(d: FileData) {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
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
    const rows = (await this.load()).listings
    const all = rows
      .map((l, idx) => ({ l, idx }))
      .filter(({ l }) => isLive(l) && (!category || l.category === category) && offerMatches(l, offer) && matches(l, q))
      .sort((a, b) =>
        Number(isFeatured(b.l, t)) - Number(isFeatured(a.l, t))
        || b.l.created_at.localeCompare(a.l.created_at)
        || b.idx - a.idx,
      )
      .map(({ l }) => l)
    return { items: all.slice(offset, offset + limit), total: all.length }
  }
  async update(id: string, patch: Partial<Listing>, ifTokenHash?: string) {
    const d = await this.load()
    const l = d.listings.find((x) => x.id === id)
    if (!l) return null
    if (ifTokenHash !== undefined && l.edit_token_hash !== ifTokenHash) return null
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
    if (l.status === 'removed') throw new Error('removed listing')
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
  async recordMetric(listingId: string, kind: MetricKind) {
    const d = await this.load()
    const l = d.listings.find((x) => x.id === listingId && x.status !== 'removed')
    if (!l) return
    const day = utcDay()
    const byDay = (d.metrics[listingId] ??= {})
    const row = (byDay[day] ??= {})
    row[kind] = (row[kind] ?? 0) + 1
    await this.save(d)
  }
  async getMetrics(listingId: string, days = 30): Promise<ListingMetrics> {
    const d = await this.load()
    const byDay = d.metrics[listingId] ?? {}
    const windowDays = Math.min(365, Math.max(1, Math.trunc(days)))
    const since = new Date(Date.now() - (windowDays - 1) * 86_400_000).toISOString().slice(0, 10)
    const totals = EMPTY_TOTALS()
    const recent = EMPTY_TOTALS()
    const kinds: MetricKind[] = ['views', 'visit_clicks', 'pay_clicks', 'mcp_lookups', 'badge_loads']
    for (const [day, row] of Object.entries(byDay)) {
      for (const k of kinds) {
        const v = Number(row[k] ?? 0)
        totals[k] += v
        if (day >= since) recent[k] += v
      }
    }
    return { window_days: windowDays, totals, recent }
  }
  async expiringFeatured(fromIso: string, toIso: string) {
    const fromMs = Date.parse(fromIso)
    const toMs = Date.parse(toIso)
    return (await this.load()).listings.filter((l) => {
      if (l.status !== 'active' || !l.featured_until) return false
      const untilMs = Date.parse(l.featured_until)
      return untilMs > fromMs && untilMs <= toMs && l.feature_reminder_for !== l.featured_until
    })
  }
}

const SUPABASE_TIMEOUT_MS = 10_000

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
    const signal = init.signal ?? AbortSignal.timeout(SUPABASE_TIMEOUT_MS)
    const r = await this.f(`${this.base()}${p}`, { ...init, signal, cache: 'no-store', headers: this.headers(prefer ? { prefer } : {}) })
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
  async update(id: string, patch: Partial<Listing>, ifTokenHash?: string) {
    const cond = ifTokenHash !== undefined ? `&edit_token_hash=eq.${encodeURIComponent(ifTokenHash)}` : ''
    const rows = await this.rest(`listings?id=eq.${encodeURIComponent(id)}${cond}`, {
      method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: now() }),
    }, 'return=representation') as Listing[]
    return rows[0] ?? null
  }
  async recentByIp(ipHash: string, sinceIso: string) {
    const r = await this.f(`${this.base()}listings?select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gt.${encodeURIComponent(sinceIso)}&limit=1`, {
      method: 'HEAD', signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS), cache: 'no-store', headers: this.headers({ prefer: 'count=exact' }),
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
  async recordMetric(listingId: string, kind: MetricKind) {
    await this.rest('rpc/record_listing_metric', {
      method: 'POST', body: JSON.stringify({ p_listing_id: listingId, p_kind: kind }),
    })
  }
  async getMetrics(listingId: string, days = 30): Promise<ListingMetrics> {
    const r = await this.rest('rpc/get_listing_metrics', {
      method: 'POST', body: JSON.stringify({ p_listing_id: listingId, p_days: days }),
    }) as ListingMetrics | null
    if (!r || !r.totals || !r.recent) return EMPTY_METRICS(days)
    return {
      window_days: Number(r.window_days ?? days),
      totals: {
        views: Number(r.totals.views ?? 0),
        visit_clicks: Number(r.totals.visit_clicks ?? 0),
        pay_clicks: Number(r.totals.pay_clicks ?? 0),
        mcp_lookups: Number(r.totals.mcp_lookups ?? 0),
        badge_loads: Number(r.totals.badge_loads ?? 0),
      },
      recent: {
        views: Number(r.recent.views ?? 0),
        visit_clicks: Number(r.recent.visit_clicks ?? 0),
        pay_clicks: Number(r.recent.pay_clicks ?? 0),
        mcp_lookups: Number(r.recent.mcp_lookups ?? 0),
        badge_loads: Number(r.recent.badge_loads ?? 0),
      },
    }
  }
  async expiringFeatured(fromIso: string, toIso: string) {
    const rows = await this.rest(
      `listings?select=*&status=eq.active&featured_until=gt.${encodeURIComponent(fromIso)}&featured_until=lte.${encodeURIComponent(toIso)}&limit=100`,
    ) as Listing[]
    return rows.filter((l) => l.featured_until && l.feature_reminder_for !== l.featured_until)
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
  const cleanQ: Query = {
    q: q.q?.slice(0, 100) || undefined,
    category: q.category || undefined,
    offer: q.offer || undefined,
  }
  const p = Number.isInteger(page) && page > 0 && page < 10_000 ? page : 1
  const founding = FOUNDING.filter((f) => (!cleanQ.category || f.category === cleanQ.category) && offerMatches(f, cleanQ.offer) && matches(f, cleanQ.q))
  let res: { items: Listing[]; total: number } = { items: [], total: 0 }
  try { res = await store().search(cleanQ, PAGE_SIZE, (p - 1) * PAGE_SIZE) } catch (e) { console.error('listings unavailable', e) }
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
