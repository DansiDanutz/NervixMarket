import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { FOUNDING } from './founding'
import { slugify, type Listing, type ListingInput } from './listing'

/** Where listings live. Production: Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, schema in
 *  supabase/schema.sql), reached server-side only. Without it: a JSON file under .data/ (local dev). */
export interface Store {
  kind: 'supabase' | 'file'
  create(input: ListingInput): Promise<Listing>
  get(id: string): Promise<Listing | null>
  bySlug(slug: string): Promise<Listing | null>
  /** Active listings (the caller still checks paid_until). */
  active(): Promise<Listing[]>
  /** Remember a NervixPay order once. False if it was already counted (a webhook retry). */
  recordPayment(orderId: string, listingId: string, detail: Record<string, unknown>): Promise<boolean>
  activate(id: string, paidUntil: string): Promise<void>
}

export const newId = () => `lst_${randomBytes(9).toString('base64url')}`
const now = () => new Date().toISOString()

function fresh(input: ListingInput, taken: (slug: string) => boolean): Listing {
  const id = newId()
  let slug = slugify(input.name)
  if (taken(slug) || FOUNDING.some((f) => f.slug === slug)) slug = `${slug}-${id.slice(-5).toLowerCase()}`
  return {
    id, slug, name: input.name, tagline: input.tagline, description: input.description,
    category: input.category as Listing['category'], offer: input.offer as Listing['offer'], price: input.price ?? '',
    website: input.website, contact: input.contact, logo: input.logo ?? '', owner_email: input.owner_email,
    status: 'pending', paid_until: null, created_at: now(), orders: [],
  }
}

export class FileStore implements Store {
  kind = 'file' as const
  constructor(private file = path.join(process.cwd(), '.data', 'listings.json')) {}
  private async load(): Promise<{ listings: Listing[]; payments: Record<string, unknown> }> {
    try { return JSON.parse(await fs.readFile(this.file, 'utf8')) } catch { return { listings: [], payments: {} } }
  }
  private async save(d: { listings: Listing[]; payments: Record<string, unknown> }) {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(d, null, 1))
    await fs.rename(tmp, this.file)
  }
  async create(input: ListingInput) {
    const d = await this.load()
    const l = fresh(input, (s) => d.listings.some((x) => x.slug === s))
    d.listings.push(l)
    await this.save(d)
    return l
  }
  async get(id: string) { return (await this.load()).listings.find((l) => l.id === id) ?? null }
  async bySlug(slug: string) { return (await this.load()).listings.find((l) => l.slug === slug) ?? null }
  async active() { return (await this.load()).listings.filter((l) => l.status === 'active') }
  async recordPayment(orderId: string, listingId: string, detail: Record<string, unknown>) {
    const d = await this.load()
    if (d.payments[orderId]) return false
    d.payments[orderId] = { listingId, ...detail, at: now() }
    const l = d.listings.find((x) => x.id === listingId)
    if (l) l.orders = [...l.orders, orderId]
    await this.save(d)
    return true
  }
  async activate(id: string, paidUntil: string) {
    const d = await this.load()
    const l = d.listings.find((x) => x.id === id)
    if (!l) return
    l.status = 'active'
    l.paid_until = paidUntil
    await this.save(d)
  }
}

export class SupabaseStore implements Store {
  kind = 'supabase' as const
  constructor(private url: string, private key: string, private f: typeof fetch = fetch) {}
  private async rest(p: string, init: RequestInit = {}, prefer?: string) {
    const r = await this.f(`${this.url.replace(/\/$/, '')}/rest/v1/${p}`, {
      ...init, cache: 'no-store',
      headers: { apikey: this.key, authorization: `Bearer ${this.key}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) },
    })
    if (!r.ok) throw new Error(`database ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const t = await r.text()
    return t ? JSON.parse(t) : null
  }
  private one = async (q: string) => ((await this.rest(`listings?${q}&limit=1`)) as Listing[])[0] ?? null
  async create(input: ListingInput) {
    const base = slugify(input.name)
    const taken = !!(await this.one(`select=id&slug=eq.${encodeURIComponent(base)}`))
    const l = fresh(input, () => taken)
    const [row] = (await this.rest('listings', { method: 'POST', body: JSON.stringify(l) }, 'return=representation')) as Listing[]
    return row
  }
  get = (id: string) => this.one(`select=*&id=eq.${encodeURIComponent(id)}`)
  bySlug = (slug: string) => this.one(`select=*&slug=eq.${encodeURIComponent(slug)}`)
  async active() { return (await this.rest('listings?select=*&status=eq.active&order=created_at.desc&limit=1000')) as Listing[] }
  async recordPayment(orderId: string, listingId: string, detail: Record<string, unknown>) {
    const rows = (await this.rest('membership_payments?on_conflict=order_id', {
      method: 'POST', body: JSON.stringify({ order_id: orderId, listing_id: listingId, detail }),
    }, 'resolution=ignore-duplicates,return=representation')) as unknown[]
    return rows.length > 0
  }
  async activate(id: string, paidUntil: string) {
    await this.rest(`listings?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'active', paid_until: paidUntil }) })
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

/** Every public listing: DansLab's founding projects plus everyone's active ones. */
export async function everything(): Promise<Listing[]> {
  let mine: Listing[] = []
  try { mine = await store().active() } catch (e) { console.error('listings unavailable', e) }
  return [...FOUNDING, ...mine]
}
