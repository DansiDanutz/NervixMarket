import { createHmac } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as healthGET } from '@/app/api/health/route'
import { GET as listGET, POST as listPOST } from '@/app/api/listings/route'
import { GET as oneGET, PATCH as onePATCH, DELETE as oneDELETE } from '@/app/api/listings/[id]/route'
import { POST as recoverPOST } from '@/app/api/manage/recover/route'
import { PATCH as adminPATCH } from '@/app/api/admin/listings/[id]/route'
import { POST as hookPOST } from '@/app/api/webhooks/nervixpay/route'
import { GET as prefillGET } from '@/app/api/prefill/route'
import { validate } from '@/lib/listing'
import { config, featureProblem, type PaidEvent } from '@/lib/nervixpay'
import { assertPublic, isPrivateIp, PrefillError, prefill } from '@/lib/prefill'
import { RateLimiter } from '@/lib/rate-limit'
import { FileStore, setStore, store } from '@/lib/store'
import nextConfig from '@/next.config'

const good = {
  name: 'Signal Craft',
  tagline: 'Builds clean real-time market alerts.',
  category: 'agents',
  offer: 'both',
  description: 'Watches feeds and notifies teams.',
  website: 'https://signalcraft.example.com',
  contact: '@signalcraft',
  owner_email: 'founder@signalcraft.example.com',
  price: '$19/month',
}

const SECRET = 'c'.repeat(64)
const sign = (body: string, t = Math.floor(Date.now() / 1000), secret = SECRET) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
const paid = (over: Partial<PaidEvent> = {}): PaidEvent => ({
  event: 'payment.paid',
  orderId: 'ord-hardening-1',
  paymentLinkId: 'link-123',
  currencyToken: 'USDC',
  network: 'polygon',
  amountReceived: '10.00',
  transactionId: '0xdef',
  paidAt: new Date().toISOString(),
  customerReference: null,
  customerEmail: null,
  ...over,
})

const fileStore = () => {
  const s = new FileStore(path.join(mkdtempSync(path.join(tmpdir(), 'nm-hard-')), 'l.json'))
  setStore(s)
  return s
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const tokenOf = (manage: string) => manage.split('#')[1]

describe('SSRF hardening (lib/prefill.ts)', () => {
  it('blocks IPv4-mapped IPv6 addresses in hex form (Node URL normalization bypass)', async () => {
    // Node normalizes https://[::ffff:127.0.0.1]/ -> hostname [::ffff:7f00:1]
    for (const ip of [
      '::ffff:7f00:1',
      '::ffff:a9fe:a9fe',
      '::ffff:0a00:0001',
      '::ffff:c0a8:0101',
      '::ffff:ac10:0001',
      '0:0:0:0:0:0:0:1',
      '0:0:0:0:0:0:0:0',
      '::ffff:0:127.0.0.1',
      '64:ff9b::7f00:1',
      '2002:7f00:0001::1',
      '2002:a9fe:a9fe::1',
      '100::1',
      '2001::1',
      '2001:db8::1',
      'fe80::1',
      'fec0::1',
      'fc00::1',
      'ff02::1',
    ]) {
      expect(isPrivateIp(ip), `expected ${ip} to be private`).toBe(true)
    }
    // Public IPv6 and public IPv4-mapped IPv6 stay allowed
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false)
    expect(isPrivateIp('::ffff:5db8:d822')).toBe(false) // 93.184.216.34

    await expect(assertPublic(new URL('https://[::ffff:127.0.0.1]/'))).rejects.toThrow(/public/)
    await expect(assertPublic(new URL('https://[::ffff:169.254.169.254]/'))).rejects.toThrow(/public/)
    await expect(assertPublic(new URL('https://localhost./'))).rejects.toThrow(/public/)
  })

  it('rejects oversized Content-Length and wraps unexpected network errors safely', async () => {
    const resolve = async () => ['93.184.216.34']
    const huge = (async () =>
      new Response('<html></html>', {
        headers: { 'content-type': 'text/html', 'content-length': String(10_000_000) },
      })) as unknown as typeof fetch
    await expect(prefill('https://public.example/', { fetch: huge, resolve })).rejects.toThrow(/too large/)

    const internalCrash = (async () => {
      throw new Error('ECONNREFUSED 10.0.0.99:443 internal socket detail')
    }) as unknown as typeof fetch
    await expect(prefill('https://public.example/', { fetch: internalCrash, resolve })).rejects.toThrow(PrefillError)
    await expect(prefill('https://public.example/', { fetch: internalCrash, resolve })).rejects.toThrow(
      'Could not reach that site.',
    )
  })
})

describe('RateLimiter', () => {
  it('enforces sliding window limits and prunes keys cleanly under cap', () => {
    const lim = new RateLimiter(2, 1000, 3)
    expect(lim.take('a', 100).ok).toBe(true)
    expect(lim.take('a', 200).ok).toBe(true)
    const blocked = lim.take('a', 300)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterS).toBeGreaterThanOrEqual(1)
    expect(lim.check('a', 300).ok).toBe(false)
    expect(lim.take('a', 1200).ok).toBe(true)

    // Bounded growth
    for (let i = 0; i < 10; i++) lim.take(`ip-${i}`, 2000)
    expect(lim.take('fresh', 2000).ok).toBe(true)
  })
})

describe('listing validation & sanitization', () => {
  it('rejects private/localhost/credentialed URLs and strips control/bidi characters', () => {
    expect(validate({ ...good, website: 'https://localhost/app' }).ok).toBe(false)
    expect(validate({ ...good, website: 'https://127.0.0.1/app' }).ok).toBe(false)
    expect(validate({ ...good, website: 'https://user:pass@example.com' }).ok).toBe(false)
    expect(validate({ ...good, logo: 'https://169.254.169.254/logo.png' }).ok).toBe(false)

    const v = validate({ ...good, name: 'Safe\u202EName\x00', description: 'Line 1\nLine 2\x07' })
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.value.name).toBe('SafeName')
      expect(v.value.description).toBe('Line 1\nLine 2')
    }
  })
})

describe('API hardening: body limits, partial PATCH, Featured preservation, recovery rollback, health', () => {
  const savedEnv = { ...process.env }

  beforeEach(() => {
    fileStore()
    process.env.LISTINGS_PER_HOUR = '100'
    process.env.NERVIXPAY_LINK_ID = 'link-123'
    process.env.NERVIXPAY_WEBHOOK_SECRET = SECRET
    process.env.ADMIN_TOKEN = 'super-secure-admin-token-123456'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k]
    }
    Object.assign(process.env, savedEnv)
  })

  it('rejects oversized bodies with 413 and non-object JSON with 400', async () => {
    const big = JSON.stringify({ ...good, description: 'a'.repeat(40_000) })
    const r413 = await listPOST(
      new Request('http://x/api/listings', { method: 'POST', body: big, headers: { 'x-real-ip': '20.1.1.1' } }),
    )
    expect(r413.status).toBe(413)

    const r400 = await listPOST(
      new Request('http://x/api/listings', { method: 'POST', body: '[]', headers: { 'x-real-ip': '20.1.1.2' } }),
    )
    expect(r400.status).toBe(400)
  })

  it('preserves featured flag and pay_mode on partial PATCH updates', async () => {
    const created = await (
      await listPOST(
        new Request('http://x/api/listings', {
          method: 'POST',
          body: JSON.stringify({ ...good, pay_link: 'https://nervixpay.live/l/sc001', pay_mode: 'subscribe' }),
          headers: { 'x-real-ip': '21.1.1.1' },
        }),
      )
    ).json()
    const t = tokenOf(created.manage)

    // Feature the listing
    const ev = paid({ customerReference: created.id })
    const raw = JSON.stringify(ev)
    expect(
      (await hookPOST(new Request('http://x/api/webhooks/nervixpay', { method: 'POST', body: raw, headers: { 'x-nervixpay-signature': sign(raw) } }))).status,
    ).toBe(200)

    // Partial PATCH updating only pay_mode without resending pay_link keeps pay_link + updates pay_mode + returns featured: true
    const p1 = await (
      await onePATCH(
        new Request(`http://x/api/listings/${created.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ pay_mode: 'buy' }),
          headers: { 'x-manage-token': t },
        }),
        ctx(created.id),
      )
    ).json()
    expect(p1.pay_link).toBe('https://nervixpay.live/l/sc001')
    expect(p1.pay_mode).toBe('buy')
    expect(p1.featured).toBe(true)

    // Partial PATCH updating only tagline keeps featured: true
    const p2 = await (
      await onePATCH(
        new Request(`http://x/api/listings/${created.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ tagline: 'Updated tagline with plenty of detail' }),
          headers: { 'x-manage-token': t },
        }),
        ctx(created.id),
      )
    ).json()
    expect(p2.featured).toBe(true)
    expect(p2.pay_mode).toBe('buy')
  })

  it('recovers manage links safely: rolls back token if email delivery fails and rate-limits floods', async () => {
    const created = await (
      await listPOST(
        new Request('http://x/api/listings', {
          method: 'POST',
          body: JSON.stringify(good),
          headers: { 'x-real-ip': '22.1.1.1' },
        }),
      )
    ).json()
    const origToken = tokenOf(created.manage)
    const origHash = (await store().get(created.id))?.edit_token_hash

    process.env.RESEND_API_KEY = 're_test_key'
    process.env.MAIL_FROM = 'Nervix Space <hello@nervix.space>'

    // Simulate Resend failure during recovery: old token MUST stay intact!
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 500 })),
    )
    const r = await recoverPOST(
      new Request('http://x/api/manage/recover', {
        method: 'POST',
        body: JSON.stringify({ email: good.owner_email }),
        headers: { 'x-real-ip': '22.2.2.2' },
      }),
    )
    expect(r.status).toBe(200)
    expect((await store().get(created.id))?.edit_token_hash).toBe(origHash)

    // Original manage token still works!
    const checkOwner = await (
      await oneGET(new Request(`http://x/api/listings/${created.id}`, { headers: { 'x-manage-token': origToken } }), ctx(created.id))
    ).json()
    expect(checkOwner.owner).toBe(true)

    // IP flood triggers 429
    let got429 = false
    for (let i = 0; i < 8; i++) {
      const res = await recoverPOST(
        new Request('http://x/api/manage/recover', {
          method: 'POST',
          body: JSON.stringify({ email: `user${i}@example.com` }),
          headers: { 'x-real-ip': '22.3.3.3' },
        }),
      )
      if (res.status === 429) {
        got429 = true
        expect(res.headers.get('retry-after')).toBeTruthy()
        break
      }
    }
    expect(got429).toBe(true)
  })

  it('ignores webhook for removed listings and rejects missing orderId', async () => {
    expect(featureProblem(paid({ orderId: '', customerReference: 'lst_abc123' }), config())).toBe('missing order id')
    process.env.FEATURE_DAYS = 'not-a-number'
    expect(config().featureDays).toBe(30)

    const created = await (
      await listPOST(
        new Request('http://x/api/listings', {
          method: 'POST',
          body: JSON.stringify(good),
          headers: { 'x-real-ip': '23.1.1.1' },
        }),
      )
    ).json()
    await oneDELETE(
      new Request(`http://x/api/listings/${created.id}`, {
        method: 'DELETE',
        headers: { 'x-manage-token': tokenOf(created.manage) },
      }),
      ctx(created.id),
    )

    const ev = paid({ orderId: 'ord-removed-1', customerReference: created.id })
    const raw = JSON.stringify(ev)
    const res = await hookPOST(
      new Request('http://x/api/webhooks/nervixpay', {
        method: 'POST',
        body: raw,
        headers: { 'x-nervixpay-signature': sign(raw) },
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ignored: 'removed listing' })
  })

  it('rate-limits repeated failed admin token guesses', async () => {
    const created = await (
      await listPOST(
        new Request('http://x/api/listings', {
          method: 'POST',
          body: JSON.stringify(good),
          headers: { 'x-real-ip': '24.1.1.1' },
        }),
      )
    ).json()

    let locked = false
    for (let i = 0; i < 12; i++) {
      const r = await adminPATCH(
        new Request(`http://x/api/admin/listings/${created.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'hidden' }),
          headers: { authorization: 'Bearer wrong-token', 'x-real-ip': '24.9.9.9' },
        }),
        ctx(created.id),
      )
      if (r.status === 429) {
        locked = true
        break
      }
    }
    expect(locked).toBe(true)
  })

  it('rate-limits /api/prefill bursts per IP', async () => {
    let limited = false
    for (let i = 0; i < 25; i++) {
      const r = await prefillGET(
        new Request('http://x/api/prefill?url=not-a-url', { headers: { 'x-real-ip': '25.5.5.5' } }),
      )
      if (r.status === 429) {
        limited = true
        break
      }
    }
    expect(limited).toBe(true)
  })

  it('orders listings deterministically even when created within the same millisecond', async () => {
    for (let i = 0; i < 15; i++) {
      await listPOST(
        new Request('http://x/api/listings', {
          method: 'POST',
          body: JSON.stringify({ ...good, name: `SameMs App ${i}` }),
          headers: { 'x-real-ip': '26.1.1.1' },
        }),
      )
    }
    const res = await (await listGET(new Request('http://x/api/listings?q=samems'))).json()
    expect(res.listings[0].name).toBe('SameMs App 14')
    expect(res.listings[14].name).toBe('SameMs App 0')
  })

  it('serves /api/health with 200 when store is healthy and 503 when degraded', async () => {
    const ok = await healthGET()
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect(await ok.json()).toMatchObject({ ok: true, status: 'ok', store: 'file' })

    const s = fileStore()
    s.search = async () => {
      throw new Error('db down')
    }
    const bad = await healthGET()
    expect(bad.status).toBe(503)
    expect(await bad.json()).toMatchObject({ ok: false, status: 'degraded' })
  })

  it('configures production security headers and disables X-Powered-By in next.config.ts', async () => {
    expect(nextConfig.poweredByHeader).toBe(false)
    const rules = await nextConfig.headers!()
    const globalRule = rules.find((r) => r.source === '/:path*')
    const keys = globalRule?.headers.map((h) => h.key) ?? []
    expect(keys).toContain('Content-Security-Policy')
    expect(keys).toContain('X-Frame-Options')
    expect(keys).toContain('X-Content-Type-Options')
    expect(keys).toContain('Referrer-Policy')
    expect(keys).toContain('Permissions-Policy')
    expect(keys).toContain('Cross-Origin-Opener-Policy')

    const manageRule = rules.find((r) => r.source === '/manage/:path*')
    expect(manageRule?.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' })
  })
})
