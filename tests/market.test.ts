import { createHmac } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { FREE_UNTIL, isFree, isLive, search, slugify, toPublic, validate } from '@/lib/listing'
import { checkoutUrl, extendUntil, membershipProblem, verifySignature, type PaidEvent } from '@/lib/nervixpay'
import { FileStore, setStore } from '@/lib/store'
import { FOUNDING } from '@/lib/founding'
import { GET as listGET, POST as listPOST } from '@/app/api/listings/route'
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

describe('listings', () => {
  it('validates and cleans what people submit', () => {
    const v = validate(good)
    expect(v.ok && v.value.owner_email).toBe('owner@example.com')
    const bad = validate({ ...good, website: 'http://x.com', category: 'nope', owner_email: 'no', description: 'short' })
    expect(bad.ok ? [] : Object.keys(bad.errors).sort()).toEqual(['category', 'description', 'owner_email', 'website'])
    expect(slugify('Lead Genie — AI!')).toBe('lead-genie-ai')
  })
  it('search shows only live listings, founding first, every word must match', () => {
    const all = FOUNDING.map(toPublic)
    expect(search(all, {}).length).toBe(FOUNDING.length)
    expect(search(all, { q: 'crypto checkout' }).map((l) => l.slug)).toEqual(['nervixpay'])
    expect(search(all, { category: 'trading' }).map((l) => l.slug)).toEqual(['zmarty'])
    expect(isLive({ status: 'active', paid_until: '2000-01-01T00:00:00Z' })).toBe(false)
  })
})

describe('NervixPay membership', () => {
  it('builds the checkout link with the listing as reference', () => {
    const u = checkoutUrl('lst_abc', 'a@b.co', { base: 'https://nervixpay.live', linkId: 'link-123', secret: '', membershipDays: 365 })
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
  it('only counts 10 USD in USDT/USDC on the membership link', () => {
    const c = { base: '', linkId: 'link-123', secret: SECRET, membershipDays: 365 }
    expect(membershipProblem(paid({ customerReference: 'lst_x' }), c)).toBeNull()
    expect(membershipProblem(paid({ customerReference: 'lst_x', currencyToken: 'ETH' }), c)).toMatch(/ETH/)
    expect(membershipProblem(paid({ customerReference: 'lst_x', amountReceived: '5' }), c)).toMatch(/below/)
    expect(membershipProblem(paid({ customerReference: 'lst_x', paymentLinkId: 'other' }), c)).toMatch(/another/)
    expect(membershipProblem(paid(), c)).toMatch(/reference/)
  })
  it('renewals extend from the current end date', () => {
    const now = Date.parse('2026-11-01T00:00:00Z')
    expect(extendUntil(null, 365, now)).toBe('2027-11-01T00:00:00.000Z')
    expect(extendUntil('2027-01-01T00:00:00.000Z', 30, now)).toBe('2027-01-31T00:00:00.000Z')
  })
})

describe('end to end: submit → pay → live', () => {
  beforeEach(() => {
    setStore(new FileStore(path.join(mkdtempSync(path.join(tmpdir(), 'nm-')), 'l.json')))
    process.env.NERVIXPAY_LINK_ID = 'link-123'
    process.env.NERVIXPAY_WEBHOOK_SECRET = SECRET
    process.env.FREE_SPOTS = '0' // the paid path; free spots are tested below
  })
  const post = (body: unknown) => new Request('http://x/api/listings', { method: 'POST', body: JSON.stringify(body) })
  const deliver = (e: PaidEvent, sig?: string) => {
    const body = JSON.stringify(e)
    return hook(new Request('http://x/api/webhooks/nervixpay', { method: 'POST', body, headers: { 'x-nervixpay-signature': sig ?? sign(body) } }))
  }

  it('a listing stays hidden until a verified payment, and a retry changes nothing', async () => {
    const r = await listPOST(post(good))
    expect(r.status).toBe(201)
    const j = await r.json()
    expect(j.checkout).toContain(`/l/link-123?ref=${j.id}`)
    const q = async () => (await (await listGET(new Request('http://x/api/listings?q=lead genie'))).json()).count
    expect(await q()).toBe(0)

    expect((await deliver(paid({ customerReference: j.id }), 't=1,v1=' + '0'.repeat(64))).status).toBe(401)
    expect(await (await deliver(paid({ customerReference: j.id, amountReceived: '1' }))).json()).toMatchObject({ ignored: expect.stringMatching(/below/) })
    expect(await q()).toBe(0)

    const ok = await (await deliver(paid({ customerReference: j.id }))).json()
    expect(ok).toMatchObject({ ok: true, listing: 'lead-genie' })
    expect(await q()).toBe(1)
    const again = await (await deliver(paid({ customerReference: j.id }))).json()
    expect(again).toMatchObject({ duplicate: true })
    const listed = (await (await listGET(new Request('http://x/api/listings?q=lead'))).json()).listings[0]
    expect(listed.owner_email).toBeUndefined()
    expect(listed.orders).toBeUndefined()
  })
  it('rejects a bad submission with the reasons', async () => {
    const r = await listPOST(post({ ...good, website: 'nope' }))
    expect(r.status).toBe(422)
    expect((await r.json()).errors.website).toBeTruthy()
  })
})

describe('free founding spots', () => {
  beforeEach(() => {
    setStore(new FileStore(path.join(mkdtempSync(path.join(tmpdir(), 'nm-')), 'l.json')))
    process.env.NERVIXPAY_LINK_ID = 'link-123'
    process.env.FREE_SPOTS = '2'
  })
  const post = (body: unknown) => new Request('http://x/api/listings', { method: 'POST', body: JSON.stringify(body) })
  const left = async () => (await (await listGET(new Request('http://x/api/listings'))).json()).free_spots_left

  it('the first N projects go live at once for free, then the membership applies', async () => {
    expect(await left()).toBe(2)
    const a = await (await listPOST(post({ ...good, name: 'Alpha One' }))).json()
    expect(a).toMatchObject({ status: 'active', free: true, page: '/l/alpha-one' })
    const b = await (await listPOST(post({ ...good, name: 'Beta Two' }))).json()
    expect(b.free).toBe(true)
    expect(await left()).toBe(0)
    const c = await (await listPOST(post({ ...good, name: 'Gamma Three' }))).json()
    expect(c.free).toBeUndefined()
    expect(c.status).toBe('pending')
    expect(c.checkout).toContain(`ref=${c.id}`)
    const live = (await (await listGET(new Request('http://x/api/listings?q=one two three'))).json())
    expect(live.count).toBe(0)
    const names = (await (await listGET(new Request('http://x/api/listings'))).json()).listings.map((l: { name: string }) => l.name)
    expect(names).toEqual(expect.arrayContaining(['Alpha One', 'Beta Two']))
    expect(names).not.toContain('Gamma Three')
    expect(isFree({ paid_until: FREE_UNTIL }) && isLive({ status: 'active', paid_until: FREE_UNTIL })).toBe(true)
  })
  it('bots that fill the hidden field are turned away', async () => {
    const r = await listPOST(post({ ...good, company: 'spam inc' }))
    expect(r.status).toBe(400)
    expect(await left()).toBe(2)
  })
})

describe('supabase keys', () => {
  it('sends new sb_secret keys only as apikey, legacy JWTs also as bearer', async () => {
    const { SupabaseStore } = await import('@/lib/store')
    const seen: Headers[] = []
    const f = (async (_u: string, init: RequestInit) => { seen.push(new Headers(init.headers)); return new Response('[]') }) as unknown as typeof fetch
    await new SupabaseStore('https://x.supabase.co', 'sb_secret_abc', f).active()
    await new SupabaseStore('https://x.supabase.co', 'eyJhbGciOi.legacy', f).active()
    expect(seen[0].get('apikey')).toBe('sb_secret_abc')
    expect(seen[0].get('authorization')).toBeNull()
    expect(seen[1].get('authorization')).toBe('Bearer eyJhbGciOi.legacy')
  })
})

describe('failure recovery', () => {
  it('returns a retryable JSON response when listing storage fails', async () => {
    const s = new FileStore('/unused')
    s.create = async () => { throw new Error('database unavailable') }
    setStore(s)
    const r = await listPOST(new Request('http://x/api/listings', { method: 'POST', body: JSON.stringify(good) }))
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ error: 'Unable to save your listing right now. Please try again shortly.' })
  })
  it('records payment and activation together rather than using separate writes', async () => {
    const s = new FileStore(path.join(mkdtempSync(path.join(tmpdir(), 'nm-')), 'l.json'))
    s.activate = async () => { throw new Error('separate activation failed') }
    setStore(s)
    process.env.NERVIXPAY_LINK_ID = 'link-123'
    process.env.NERVIXPAY_WEBHOOK_SECRET = SECRET
    const l = await s.create(good)
    const body = JSON.stringify(paid({ customerReference: l.id, orderId: 'atomic-order' }))
    const deliver = () => hook(new Request('http://x/api/webhooks/nervixpay', { method: 'POST', body, headers: { 'x-nervixpay-signature': sign(body) } }))
    expect((await deliver()).status).toBe(200)
    const first = await s.get(l.id)
    expect(first?.status).toBe('active')
    expect((await (await deliver()).json()).duplicate).toBe(true)
    expect((await s.get(l.id))?.paid_until).toBe(first?.paid_until)
  })
})
