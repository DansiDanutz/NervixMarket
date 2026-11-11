import { createHmac } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanPayLink, isLive, matches, search, slugify, toPublic, validate, type Listing } from '@/lib/listing'
import { checkoutUrl, extendUntil, featureProblem, verifySignature, type PaidEvent } from '@/lib/nervixpay'
import { hashToken, tokenMatches } from '@/lib/owner'
import { assertPublic, isPrivateIp, parseMeta, prefill } from '@/lib/prefill'
import { FileStore, SupabaseStore, setStore, store } from '@/lib/store'
import { FOUNDING } from '@/lib/founding'
import { GET as listGET, POST as listPOST } from '@/app/api/listings/route'
import { DELETE as oneDELETE, GET as oneGET, PATCH as onePATCH } from '@/app/api/listings/[id]/route'
import { POST as reportPOST } from '@/app/api/listings/[id]/report/route'
import { PATCH as adminPATCH } from '@/app/api/admin/listings/[id]/route'
import { POST as hook } from '@/app/api/webhooks/nervixpay/route'

const good = {
  name: 'Lead Genie', tagline: 'Finds and qualifies leads for B2B teams.', category: 'agents', offer: 'both',
  description: 'An agent that researches companies, finds decision makers and writes the first email. Runs every morning.',
  website: 'https://leadgenie.example.com', contact: '@leadgenie', owner_email: 'Owner@Example.com', price: '$29/month',
}
const SECRET = 'a'.repeat(64)
const sign = (body: string, t = Math.floor(Date.now() / 1000), secret = SECRET) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
const paid = (over: Partial<PaidEvent> = {}): PaidEvent => ({
  event: 'payment.paid', orderId: 'ord-1', paymentLinkId: 'link-123', currencyToken: 'USDT', network: 'polygon',
  amountReceived: '10.000123', transactionId: '0xabc', paidAt: new Date().toISOString(), customerReference: null,
  customerEmail: null, ...over,
})
const fileStore = () => { const s = new FileStore(path.join(mkdtempSync(path.join(tmpdir(), 'nm-')), 'l.json')); setStore(s); return s }
const post = (body: unknown, ip = '1.1.1.1') => new Request('http://x/api/listings', { method: 'POST', body: JSON.stringify(body), headers: { 'x-real-ip': ip } })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const tokenOf = (manage: string) => manage.split('#')[1]

describe('listings', () => {
  it('only needs a link, a name, a one-liner, a category and an email', () => {
    const v = validate({ website: 'https://x.co', name: 'X App', tagline: 'Does one thing well', category: 'apps', owner_email: 'Me@X.co' })
    expect(v.ok && v.value).toMatchObject({ owner_email: 'me@x.co', offer: 'use', description: '', pay_link: '', pay_mode: '' })
    const bad = validate({ ...good, website: 'http://x.com', category: 'nope', owner_email: 'no', tagline: 'short' })
    expect(bad.ok ? [] : Object.keys(bad.errors).sort()).toEqual(['category', 'owner_email', 'tagline', 'website'])
    expect(slugify('Lead Genie — AI!')).toBe('lead-genie-ai')
  })
  it('accepts only NervixPay checkout links, cleaned', () => {
    expect(cleanPayLink('https://nervixpay.live/l/abc123?ref=x#y')).toBe('https://nervixpay.live/l/abc123')
    expect(cleanPayLink('https://nervixpay.live.evil.com/l/abc123')).toBeNull()
    expect(cleanPayLink('http://nervixpay.live/l/abc123')).toBeNull()
    expect(cleanPayLink('https://user@nervixpay.live/l/abc123')).toBeNull()
    expect(cleanPayLink('https://nervixpay.live/dashboard')).toBeNull()
    const v = validate({ ...good, pay_link: 'https://nervixpay.live/l/abc123', pay_mode: 'subscribe' })
    expect(v.ok && [v.value.pay_link, v.value.pay_mode]).toEqual(['https://nervixpay.live/l/abc123', 'subscribe'])
    const d = validate({ ...good, pay_link: 'https://nervixpay.live/l/abc123', pay_mode: 'weird' })
    expect(d.ok && d.value.pay_mode).toBe('buy')
    const none = validate({ ...good, pay_mode: 'subscribe' })
    expect(none.ok && none.value.pay_mode).toBe('')
    expect(validate({ ...good, pay_link: 'https://paypal.me/x' }).ok).toBe(false)
  })
  it('search: live only, founding first, then featured, every word as a prefix', () => {
    const all = FOUNDING.map(toPublic)
    expect(search(all, {}).length).toBe(FOUNDING.length)
    expect(search(all, { q: 'crypto check' }).map((l) => l.slug)).toEqual(['nervixpay'])
    expect(search(all, { category: 'trading' }).map((l) => l.slug)).toEqual(['zmarty'])
    expect(matches({ name: 'Foo', tagline: '', description: 'unrelated', price: '' }, 'oo')).toBe(false)
    expect(isLive({ status: 'paused' })).toBe(false)
    const mk = (slug: string, created_at: string, featured_until: string | null) =>
      ({ ...FOUNDING[0], founding: false, id: slug, slug, created_at, featured_until })
    const order = search([mk('old', '2026-01-01', null), mk('feat', '2025-01-01', '2999-01-01'), mk('new', '2026-06-01', null), mk('expired', '2026-07-01', '2020-01-01')], {})
    expect(order.map((l) => l.slug)).toEqual(['feat', 'expired', 'new', 'old'])
  })
  it('never exposes private fields', () => {
    const p = toPublic({ ...FOUNDING[0], owner_email: 'a@b.co', edit_token_hash: 'h', ip_hash: 'i', orders: ['o'], paid_until: null } as Listing) as Record<string, unknown>
    for (const k of ['owner_email', 'edit_token_hash', 'ip_hash', 'orders', 'paid_until']) expect(p[k]).toBeUndefined()
  })
})

describe('manage tokens', () => {
  it('match only the right token, in constant time', () => {
    const t = 'A'.repeat(32)
    expect(tokenMatches(t, hashToken(t))).toBe(true)
    expect(tokenMatches('B'.repeat(32), hashToken(t))).toBe(false)
    expect(tokenMatches(t, '')).toBe(false)
    expect(tokenMatches('', hashToken(''))).toBe(false)
  })
})

describe('quick listing: reading a project page', () => {
  it('extracts name, tagline, description and logo', () => {
    const html = `<html><head><title>Lead Genie | AI that finds your next customers</title>
      <meta name="description" content="Lead Genie researches companies &amp; writes the first email.">
      <meta property="og:image" content="/og.png"><link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="https://cdn.x.co/a.png">
      </head></html>`
    expect(parseMeta(html, 'https://leadgenie.example.com/')).toEqual({
      name: 'Lead Genie', tagline: 'AI that finds your next customers', description: 'Lead Genie researches companies & writes the first email.',
      logo: 'https://cdn.x.co/a.png', website: 'https://leadgenie.example.com/',
    })
    const og = parseMeta(`<meta property="og:site_name" content="Acme"><meta property="og:description" content="Acme builds robots."><meta property="og:image" content="/i.png">`, 'https://acme.co/')
    expect(og).toMatchObject({ name: 'Acme', tagline: 'Acme builds robots.', logo: 'https://acme.co/i.png' })
  })
  it('refuses private and internal addresses, also after a redirect', async () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.1.1', '172.20.0.1', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0'])
      expect(isPrivateIp(ip)).toBe(true)
    expect(isPrivateIp('93.184.216.34')).toBe(false)
    await expect(assertPublic(new URL('http://example.com'))).rejects.toThrow(/https/)
    await expect(assertPublic(new URL('https://localhost/'))).rejects.toThrow(/public/)
    await expect(assertPublic(new URL('https://169.254.169.254/'))).rejects.toThrow(/public/)
    await expect(assertPublic(new URL('https://example.com:8443/'))).rejects.toThrow(/port/)
    await expect(assertPublic(new URL('https://sneaky.example/'), async () => ['10.0.0.5'])).rejects.toThrow(/public/)

    const resolve = async (h: string) => (h === 'public.example' ? ['93.184.216.34'] : ['127.0.0.1'])
    const f = (async () => new Response(null, { status: 302, headers: { location: 'https://internal.example/' } })) as unknown as typeof fetch
    await expect(prefill('https://public.example/', { fetch: f, resolve })).rejects.toThrow(/public/)
    const ok = (async () => new Response('<title>Hi There</title>', { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch
    expect((await prefill('https://public.example/', { fetch: ok, resolve })).name).toBe('Hi There')
  })
})

describe('NervixPay Featured', () => {
  it('builds the checkout link with the listing as reference', () => {
    const u = checkoutUrl('lst_abc', 'a@b.co', { base: 'https://nervixpay.live', linkId: 'link-123', secret: '', featureDays: 30 })
    expect(u).toBe('https://nervixpay.live/l/link-123?ref=lst_abc&email=a%40b.co')
  })
  it('verifies signatures in constant time and refuses replays', () => {
    const body = '{"x":1}'
    expect(verifySignature(SECRET, sign(body), body)).toBe(true)
    expect(verifySignature(SECRET, sign(body), '{"x":2}')).toBe(false)
    expect(verifySignature(SECRET, sign(body, Math.floor(Date.now() / 1000) - 600), body)).toBe(false)
    expect(verifySignature(SECRET, sign(body, undefined, 'b'.repeat(64)), body)).toBe(false)
    expect(verifySignature(SECRET, `t=1,v1=zz`, body)).toBe(false)
    expect(verifySignature('', sign(body), body)).toBe(false)
  })
  it('only counts 10 USD in USDT/USDC on the Featured link', () => {
    const c = { base: '', linkId: 'link-123', secret: SECRET, featureDays: 30 }
    expect(featureProblem(paid({ customerReference: 'lst_x' }), c)).toBeNull()
    expect(featureProblem(paid({ customerReference: 'lst_x', currencyToken: 'ETH' }), c)).toMatch(/ETH/)
    expect(featureProblem(paid({ customerReference: 'lst_x', amountReceived: '5' }), c)).toMatch(/below/)
    expect(featureProblem(paid({ customerReference: 'lst_x', paymentLinkId: 'other' }), c)).toMatch(/another/)
    expect(featureProblem(paid({ customerReference: 'lst_x' }), { ...c, linkId: '' })).toMatch(/another/)
    expect(featureProblem(paid(), c)).toMatch(/reference/)
  })
  it('extends from the current end date', () => {
    const now = Date.parse('2026-11-01T00:00:00Z')
    expect(extendUntil(null, 30, now)).toBe('2026-12-01T00:00:00.000Z')
    expect(extendUntil('2027-01-01T00:00:00.000Z', 30, now)).toBe('2027-01-31T00:00:00.000Z')
  })
})

describe('end to end: list free → live → manage', () => {
  beforeEach(() => { fileStore(); delete process.env.LISTINGS_PER_HOUR })
  const count = async (q: string) => (await (await listGET(new Request(`http://x/api/listings?q=${encodeURIComponent(q)}`))).json()).count

  it('a listing is live at once and comes with a private manage link', async () => {
    const r = await listPOST(post({ ...good, pay_link: 'https://nervixpay.live/l/genie01', pay_mode: 'subscribe' }))
    expect(r.status).toBe(201)
    const j = await r.json()
    expect(j).toMatchObject({ status: 'active', page: '/l/lead-genie', mailed: false })
    expect(j.manage).toMatch(new RegExp(`/manage/${j.id}#[A-Za-z0-9_-]{32}$`))
    expect(await count('lead genie')).toBe(1)
    const listed = (await (await listGET(new Request('http://x/api/listings?q=lead'))).json()).listings[0]
    expect(listed).toMatchObject({ pay_link: 'https://nervixpay.live/l/genie01', pay_mode: 'subscribe' })
    for (const k of ['owner_email', 'orders', 'edit_token_hash', 'ip_hash']) expect(listed[k]).toBeUndefined()
    // the stored token is a hash, not the token
    expect((await store().get(j.id))?.edit_token_hash).toBe(hashToken(tokenOf(j.manage)))
  })

  it('the owner can edit, pause, resume and delete; nobody else can', async () => {
    const j = await (await listPOST(post(good))).json()
    const t = tokenOf(j.manage)
    const call = (fn: typeof onePATCH, body: unknown, token = t) =>
      fn(new Request(`http://x/api/listings/${j.id}`, { method: 'PATCH', body: JSON.stringify(body), headers: { 'x-manage-token': token } }), ctx(j.id))

    expect((await call(onePATCH, { tagline: 'Hacked tagline here' }, 'x'.repeat(32))).status).toBe(403)
    const owner = await (await oneGET(new Request(`http://x/api/listings/${j.id}`, { headers: { 'x-manage-token': t } }), ctx(j.id))).json()
    expect(owner).toMatchObject({ owner: true, owner_email: 'owner@example.com' })
    const anon = await (await oneGET(new Request(`http://x/api/listings/${j.id}`), ctx(j.id))).json()
    expect(anon.owner_email).toBeUndefined()

    expect((await call(onePATCH, { website: 'nope' })).status).toBe(422)
    const e = await (await call(onePATCH, { tagline: 'Now with voice calls too', pay_link: 'https://nervixpay.live/l/genie02', owner_email: 'evil@x.co' })).json()
    expect(e).toMatchObject({ tagline: 'Now with voice calls too', pay_link: 'https://nervixpay.live/l/genie02', pay_mode: 'buy', name: 'Lead Genie' })
    expect((await store().get(j.id))?.owner_email).toBe('owner@example.com')
    expect(await count('voice calls')).toBe(1)

    expect((await (await call(onePATCH, { status: 'paused' })).json()).status).toBe('paused')
    expect(await count('lead')).toBe(0)
    expect((await call(onePATCH, { status: 'hidden' })).status).toBe(422)
    expect((await (await call(onePATCH, { status: 'active' })).json()).status).toBe('active')

    const del = await oneDELETE(new Request(`http://x/api/listings/${j.id}`, { method: 'DELETE', headers: { 'x-manage-token': t } }), ctx(j.id))
    expect(del.status).toBe(200)
    expect(await count('lead')).toBe(0)
    expect((await oneGET(new Request(`http://x/api/listings/${j.id}`), ctx(j.id))).status).toBe(404)
    expect((await call(onePATCH, { tagline: 'Back from the dead' })).status).toBe(404)
  })

  it('rejects a bad submission with the reasons, and bots', async () => {
    const r = await listPOST(post({ ...good, website: 'nope' }))
    expect(r.status).toBe(422)
    expect((await r.json()).errors.website).toBeTruthy()
    expect((await listPOST(post({ ...good, company: 'spam inc' }))).status).toBe(400)
  })

  it('limits how many listings one IP can create per hour', async () => {
    process.env.LISTINGS_PER_HOUR = '2'
    expect((await listPOST(post({ ...good, name: 'One App' }, '9.9.9.9'))).status).toBe(201)
    expect((await listPOST(post({ ...good, name: 'Two App' }, '9.9.9.9'))).status).toBe(201)
    expect((await listPOST(post({ ...good, name: 'Three App' }, '9.9.9.9'))).status).toBe(429)
    expect((await listPOST(post({ ...good, name: 'Other App' }, '8.8.8.8'))).status).toBe(201)
  })

  it('same names get distinct slugs', async () => {
    const a = await (await listPOST(post(good))).json()
    const b = await (await listPOST(post(good, '2.2.2.2'))).json()
    expect(a.slug).toBe('lead-genie')
    expect(b.slug).toMatch(/^lead-genie-[a-z0-9]{5}$/)
  })

  it('paginates', async () => {
    process.env.LISTINGS_PER_HOUR = '100'
    for (let i = 0; i < 40; i++) await listPOST(post({ ...good, name: `Bulk App ${i}` }))
    const p1 = await (await listGET(new Request('http://x/api/listings?q=bulk'))).json()
    const p2 = await (await listGET(new Request('http://x/api/listings?q=bulk&page=2'))).json()
    expect([p1.count, p1.pages, p1.listings.length, p2.listings.length]).toEqual([40, 2, 36, 4])
    expect(p1.listings[0].name).toBe('Bulk App 39')
  })
})

describe('moderation', () => {
  beforeEach(() => { fileStore(); process.env.REPORTS_TO_HIDE = '2'; process.env.ADMIN_TOKEN = 'admin-token-123456789' })
  const report = (id: string, ip: string) => reportPOST(new Request(`http://x/api/listings/${id}/report`, { method: 'POST', headers: { 'x-real-ip': ip } }), ctx(id))

  it('enough distinct reports hide a listing; an admin can restore it', async () => {
    const j = await (await listPOST(post(good))).json()
    await report(j.id, '5.5.5.5'); await report(j.id, '5.5.5.5')
    expect((await store().get(j.id))?.status).toBe('active')
    await report(j.id, '6.6.6.6')
    expect((await store().get(j.id))?.status).toBe('hidden')
    expect((await oneGET(new Request(`http://x/api/listings/${j.id}`), ctx(j.id))).status).toBe(404)

    const admin = (token: string) => adminPATCH(new Request(`http://x/api/admin/listings/${j.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }), headers: { authorization: `Bearer ${token}` } }), ctx(j.id))
    expect((await admin('wrong')).status).toBe(403)
    expect((await admin('admin-token-123456789')).status).toBe(200)
    expect((await store().get(j.id))?.status).toBe('active')
  })
})

describe('Featured payments', () => {
  beforeEach(() => {
    fileStore()
    process.env.NERVIXPAY_LINK_ID = 'link-123'
    process.env.NERVIXPAY_WEBHOOK_SECRET = SECRET
  })
  const deliver = (e: PaidEvent, sig?: string) => {
    const body = JSON.stringify(e)
    return hook(new Request('http://x/api/webhooks/nervixpay', { method: 'POST', body, headers: { 'x-nervixpay-signature': sig ?? sign(body) } }))
  }

  it('a verified payment features the listing, first in the directory; a retry changes nothing', async () => {
    const a = await (await listPOST(post({ ...good, name: 'Alpha App' }))).json()
    const b = await (await listPOST(post({ ...good, name: 'Beta App' }))).json()
    const first = async () => (await (await listGET(new Request('http://x/api/listings?q=app'))).json()).listings[0].slug
    expect(await first()).toBe(b.slug)

    expect((await deliver(paid({ customerReference: a.id }), 't=1,v1=' + '0'.repeat(64))).status).toBe(401)
    expect(await (await deliver(paid({ customerReference: a.id, amountReceived: '1' }))).json()).toMatchObject({ ignored: expect.stringMatching(/below/) })
    expect(await first()).toBe(b.slug)

    const ok = await (await deliver(paid({ customerReference: a.id }))).json()
    expect(ok).toMatchObject({ ok: true, listing: 'alpha-app' })
    expect(await first()).toBe(a.slug)
    const until = (await store().get(a.id))?.featured_until
    expect(await (await deliver(paid({ customerReference: a.id }))).json()).toMatchObject({ duplicate: true })
    expect((await store().get(a.id))?.featured_until).toBe(until)
    expect((await (await oneGET(new Request(`http://x/api/listings/${a.id}`), ctx(a.id))).json()).featured).toBe(true)
  })
})

describe('supabase', () => {
  it('sends new sb_secret keys only as apikey, legacy JWTs also as bearer', async () => {
    const seen: Headers[] = []
    const f = (async (_u: string, init: RequestInit) => { seen.push(new Headers(init.headers)); return new Response('{"items":[],"total":0}') }) as unknown as typeof fetch
    await new SupabaseStore('https://x.supabase.co', 'sb_secret_abc', f).search({}, 10, 0)
    await new SupabaseStore('https://x.supabase.co', 'eyJhbGciOi.legacy', f).search({}, 10, 0)
    expect(seen[0].get('apikey')).toBe('sb_secret_abc')
    expect(seen[0].get('authorization')).toBeNull()
    expect(seen[1].get('authorization')).toBe('Bearer eyJhbGciOi.legacy')
  })
  it('searches in the database and retries a slug taken at the same moment', async () => {
    const calls: { url: string; body?: string }[] = []
    let inserts = 0
    const f = (async (u: string, init: RequestInit) => {
      calls.push({ url: u, body: init.body as string })
      if (u.includes('rpc/search_listings')) return new Response('{"items":[{"slug":"a"}],"total":7}')
      if (u.endsWith('/listings') && init.method === 'POST') {
        inserts++
        return inserts === 1 ? new Response('{"code":"23505"}', { status: 409 }) : new Response(init.body as string ? `[${init.body}]` : '[]')
      }
      return new Response('[]')
    }) as unknown as typeof fetch
    const s = new SupabaseStore('https://x.supabase.co', 'sb_secret_abc', f)
    expect(await s.search({ q: 'crm', category: 'apps' }, 36, 36)).toEqual({ items: [{ slug: 'a' }], total: 7 })
    expect(JSON.parse(calls[0].body!)).toEqual({ p_q: 'crm', p_category: 'apps', p_offer: '', p_limit: 36, p_offset: 36 })
    const v = validate(good)
    const l = await s.create(v.ok ? v.value : (null as never), { edit_token_hash: 'h', ip_hash: 'i' })
    expect(inserts).toBe(2)
    expect(l.slug).toMatch(/^lead-genie-[a-z0-9]{5}$/)
  })
})

describe('failure recovery', () => {
  it('returns a retryable JSON response when listing storage fails', async () => {
    const s = fileStore()
    s.create = async () => { throw new Error('database unavailable') }
    const r = await listPOST(post(good))
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ error: 'Unable to save your listing right now. Please try again shortly.' })
  })
  it('the directory still shows the founding projects when the database is down', async () => {
    const s = fileStore()
    s.search = async () => { throw new Error('down') }
    const j = await (await listGET(new Request('http://x/api/listings'))).json()
    expect(j.count).toBe(FOUNDING.length)
  })
})
