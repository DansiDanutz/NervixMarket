import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderBadgeSvg } from '@/lib/badge'
import { isVerified, toPublic } from '@/lib/listing'
import { handleMcpMessage } from '@/lib/mcp'
import { hashToken, newToken } from '@/lib/owner'

const signWebhook = (secret: string, body: string) => {
  const t = Math.floor(Date.now() / 1000)
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
}
import { FileStore, setStore } from '@/lib/store'
import { isSameSiteHost, matchVerificationHtml, verifySiteOwnership } from '@/lib/verify'
import { GET as goGet } from '@/app/go/[slug]/route'
import { GET as getListing, PATCH as patchListing } from '@/app/api/listings/[id]/route'
import { POST as verifyRoute } from '@/app/api/listings/[id]/verify/route'
import { POST as webhookPost } from '@/app/api/webhooks/nervixpay/route'
import { GET as cronGet, POST as cronPost } from '@/app/api/cron/reminders/route'

const SAMPLE = {
  name: 'PulseBot',
  tagline: 'Realtime AI monitor for SaaS uptime and alerts.',
  description: 'Monitors endpoints and sends instant alerts.',
  category: 'agents',
  offer: 'both',
  price: '$19/mo',
  website: 'https://pulsebot.example.com',
  contact: 'team@pulsebot.example.com',
  logo: '',
  owner_email: 'founder@pulsebot.example.com',
  pay_link: 'https://nervixpay.live/l/pulsebot1',
  pay_mode: 'subscribe',
}

describe('Maker Growth & Proof Loop', () => {
  let tmpDir: string
  let fsStore: FileStore
  const envBackup = { ...process.env }

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'nervix-growth-'))
    fsStore = new FileStore(path.join(tmpDir, 'listings.json'))
    setStore(fsStore)
    process.env.SITE_URL = 'https://nervix.space'
    process.env.ADMIN_TOKEN = 'test-admin-token-1234567890'
    process.env.CRON_SECRET = 'test-cron-secret-1234567890'
    process.env.NERVIXPAY_LINK_ID = 'link-featured-1'
    process.env.NERVIXPAY_WEBHOOK_SECRET = 'w'.repeat(64)
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.MAIL_FROM = 'Nervix Space <hello@nervix.space>'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setStore(null)
    rmSync(tmpDir, { recursive: true, force: true })
    for (const k of Object.keys(process.env)) {
      if (!(k in envBackup)) delete process.env[k]
    }
    Object.assign(process.env, envBackup)
  })

  it('matches badge img, listing backlink, and nervix-verify meta tag accurately', () => {
    const l = { id: 'lst_abc1234567', slug: 'pulsebot' }
    expect(matchVerificationHtml('<img src="https://nervix.space/api/badge/pulsebot" />', l)).toBe('badge')
    expect(matchVerificationHtml('<a href="https://nervix.space/l/pulsebot">Listed</a>', l)).toBe('backlink')
    expect(matchVerificationHtml('<meta name="nervix-verify" content="lst_abc1234567" />', l)).toBe('meta')
    // Unrelated listing or spoofed host must not verify
    expect(matchVerificationHtml('<a href="https://nervix.space/l/other-project">Other</a>', l)).toBeNull()
    expect(matchVerificationHtml('<a href="https://evil.example/l/pulsebot">Spoof</a>', l)).toBeNull()
    expect(matchVerificationHtml('<meta name="nervix-verify" content="lst_wrong" />', l)).toBeNull()
  })

  it('allows apex<->www redirect during verification but rejects cross-domain redirect spoofing & SSRF', async () => {
    expect(isSameSiteHost('https://pulsebot.example.com', 'https://www.pulsebot.example.com/home')).toBe(true)
    expect(isSameSiteHost('https://attacker.example', 'https://nervix.space/l/attacker')).toBe(false)

    const resolvePublic = async () => ['93.184.216.34']

    // Apex -> www redirect with badge succeeds
    const okFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://pulsebot.example.com/') {
        return new Response(null, { status: 302, headers: { location: 'https://www.pulsebot.example.com/' } })
      }
      return new Response('<html><body><img src="https://nervix.space/api/badge/pulsebot"></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }) as unknown as typeof fetch

    const okRes = await verifySiteOwnership(
      { id: 'lst_1', slug: 'pulsebot', website: 'https://pulsebot.example.com/' },
      { fetch: okFetch, resolve: resolvePublic },
    )
    expect(okRes).toMatchObject({ verified: true, method: 'badge' })

    // Cross-domain redirect to nervix.space must be rejected
    const spoofFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://attacker.example')) {
        return new Response(null, { status: 302, headers: { location: 'https://nervix.space/l/attacker' } })
      }
      return new Response('<a href="https://nervix.space/l/attacker">Self</a>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }) as unknown as typeof fetch

    const spoofRes = await verifySiteOwnership(
      { id: 'lst_2', slug: 'attacker', website: 'https://attacker.example' },
      { fetch: spoofFetch, resolve: resolvePublic },
    )
    expect(spoofRes.verified).toBe(false)

    // IPv4-mapped IPv6 SSRF must be blocked before fetching
    const neverFetch = vi.fn() as unknown as typeof fetch
    const ssrfRes = await verifySiteOwnership(
      { id: 'lst_3', slug: 'ssrf', website: 'https://[::ffff:169.254.169.254]/' },
      { fetch: neverFetch },
    )
    expect(ssrfRes.verified).toBe(false)
    expect(neverFetch).not.toHaveBeenCalled()
  })

  it('renders Verified SVG badge and strips private feature_reminder_for from public listings', () => {
    const verifiedSvg = renderBadgeSvg({ name: 'PulseBot', verified_at: '2026-11-24T00:00:00.000Z', featured_until: null })
    expect(verifiedSvg).toContain('Verified')
    const featuredSvg = renderBadgeSvg({
      name: 'PulseBot',
      verified_at: '2026-11-24T00:00:00.000Z',
      featured_until: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(featuredSvg).toContain('Featured')

    const pub = toPublic({
      ...SAMPLE,
      id: 'lst_pub1234',
      slug: 'pulsebot',
      category: 'agents',
      offer: 'both',
      pay_mode: 'subscribe',
      featured_until: null,
      verified_at: '2026-11-24T00:00:00.000Z',
      feature_reminder_for: '2026-12-01T00:00:00.000Z',
      status: 'active',
      created_at: '2026-11-24T00:00:00.000Z',
      edit_token_hash: 'secret',
      ip_hash: 'ip',
      orders: [],
    })
    expect(isVerified(pub)).toBe(true)
    expect('feature_reminder_for' in pub).toBe(false)
    expect('owner_email' in pub).toBe(false)
  })

  it('tracks outbound /go/[slug] clicks & MCP lookups and exposes metrics only to the owner', async () => {
    const tok = newToken()
    const created = await fsStore.create(SAMPLE, { edit_token_hash: hashToken(tok), ip_hash: 'ip1' })

    // Outbound visit redirect
    const visit = await goGet(new Request('https://nervix.space/go/pulsebot?to=visit'), { params: Promise.resolve({ slug: created.slug }) })
    expect(visit.status).toBe(302)
    expect(visit.headers.get('location')).toBe(`${SAMPLE.website}/`)
    expect(visit.headers.get('cache-control')).toContain('no-store')

    // Outbound pay redirect
    const pay = await goGet(new Request('https://nervix.space/go/pulsebot?to=pay'), { params: Promise.resolve({ slug: created.slug }) })
    expect(pay.status).toBe(302)
    expect(pay.headers.get('location')).toBe(SAMPLE.pay_link)
    expect(pay.headers.get('referrer-policy')).toBe('no-referrer')

    // MCP get_listing increments mcp_lookups
    const mcpRes = await handleMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_listing', arguments: { slug: created.slug } } },
      new Request('https://nervix.space/api/mcp', { method: 'POST' }),
    )
    expect((mcpRes?.result as { structuredContent?: { verified?: boolean } })?.structuredContent?.verified).toBe(false)

    // Public GET omits metrics
    const pubRes = await getListing(new Request(`https://nervix.space/api/listings/${created.id}`), { params: Promise.resolve({ id: created.id }) })
    const pubJson = await pubRes.json()
    expect(pubJson.metrics).toBeUndefined()

    // Owner GET returns aggregated metrics
    const ownRes = await getListing(
      new Request(`https://nervix.space/api/listings/${created.id}`, { headers: { 'x-manage-token': tok } }),
      { params: Promise.resolve({ id: created.id }) },
    )
    const ownJson = await ownRes.json()
    expect(ownJson.owner).toBe(true)
    expect(ownJson.metrics.totals.visit_clicks).toBe(1)
    expect(ownJson.metrics.totals.pay_clicks).toBe(1)
    expect(ownJson.metrics.totals.mcp_lookups).toBe(1)

    // Unknown slug or missing pay_link returns 404 (no open redirect)
    const noPay = await fsStore.create({ ...SAMPLE, name: 'FreeTool', pay_link: '', pay_mode: '' }, { edit_token_hash: hashToken(newToken()), ip_hash: 'ip2' })
    const missPay = await goGet(new Request(`https://nervix.space/go/${noPay.slug}?to=pay`), { params: Promise.resolve({ slug: noPay.slug }) })
    expect(missPay.status).toBe(404)
  })

  it('clears verified_at when owner switches website to a different host, and gates /verify with owner token', async () => {
    const tok = newToken()
    const created = await fsStore.create(SAMPLE, { edit_token_hash: hashToken(tok), ip_hash: 'ip1' })
    await fsStore.update(created.id, { verified_at: '2026-11-24T01:00:00.000Z' })

    // Bad token on /verify returns 403
    const badVerify = await verifyRoute(
      new Request(`https://nervix.space/api/listings/${created.id}/verify`, { method: 'POST', headers: { 'x-manage-token': 'wrong-token-1234567890' } }),
      { params: Promise.resolve({ id: created.id }) },
    )
    expect(badVerify.status).toBe(403)

    // Same host (www) preserves verified_at
    const sameHost = await patchListing(
      new Request(`https://nervix.space/api/listings/${created.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-manage-token': tok },
        body: JSON.stringify({ website: 'https://www.pulsebot.example.com/app' }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    )
    expect((await sameHost.json()).verified).toBe(true)

    // Switching to a different domain clears verified_at
    const diffHost = await patchListing(
      new Request(`https://nervix.space/api/listings/${created.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-manage-token': tok },
        body: JSON.stringify({ website: 'https://other-domain.example.org' }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    )
    const diffJson = await diffHost.json()
    expect(diffJson.verified).toBe(false)
    expect(diffJson.verified_at).toBeNull()
  })

  it('emails a Featured receipt once on fresh NervixPay settlement (never on duplicate retry)', async () => {
    const tok = newToken()
    const created = await fsStore.create(SAMPLE, { edit_token_hash: hashToken(tok), ip_hash: 'ip1' })

    const mailSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"email_1"}', { status: 200 }))
    const payload = JSON.stringify({
      event: 'payment.paid',
      orderId: 'ord_growth_1',
      paymentLinkId: 'link-featured-1',
      customerReference: created.id,
      amountReceived: '10.00',
      currencyToken: 'USDT',
      network: 'TRON',
      transactionId: 'tx_123',
      paidAt: new Date().toISOString(),
    })
    vi.stubEnv('NERVIX_SPACE_FEATURE_SIGNING_KEY', 'fixture-feature-only-key')
    const scopedKey = process.env.NERVIX_SPACE_FEATURE_SIGNING_KEY!
    const other = JSON.stringify({ ...JSON.parse(payload), paymentLinkId: 'other-link' })
    const denied = await webhookPost(new Request('https://nervix.space/api/webhooks/nervixpay', {
      method: 'POST', headers: { 'x-nervixpay-signature': signWebhook(scopedKey, other) }, body: other,
    }))
    expect(denied.status).toBe(403)
    const sig = signWebhook(scopedKey, payload)

    const r1 = await webhookPost(new Request('https://nervix.space/api/webhooks/nervixpay', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nervixpay-signature': sig },
      body: payload,
    }))
    const j1 = await r1.json()
    expect(r1.status).toBe(200)
    expect(j1.mailed).toBe(true)
    expect(mailSpy).toHaveBeenCalledTimes(1)

    // Duplicate retry must NOT send a second email
    const r2 = await webhookPost(new Request('https://nervix.space/api/webhooks/nervixpay', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nervixpay-signature': sig },
      body: payload,
    }))
    const j2 = await r2.json()
    expect(j2.duplicate).toBe(true)
    expect(mailSpy).toHaveBeenCalledTimes(1)
  })

  it('sends idempotent 48h Featured expiry reminders only to authorized cron callers', async () => {
    const expiring = await fsStore.create(SAMPLE, { edit_token_hash: hashToken(newToken()), ip_hash: 'ip1' })
    const farFuture = await fsStore.create({ ...SAMPLE, name: 'LongBot' }, { edit_token_hash: hashToken(newToken()), ip_hash: 'ip2' })
    const in24h = new Date(Date.now() + 24 * 3_600_000).toISOString()
    const in10d = new Date(Date.now() + 10 * 86_400_000).toISOString()
    await fsStore.update(expiring.id, { featured_until: in24h } as never)
    await fsStore.update(farFuture.id, { featured_until: in10d } as never)

    // Unauthorized caller rejected
    const unauth = await cronGet(new Request('https://nervix.space/api/cron/reminders'))
    expect(unauth.status).toBe(403)

    const mailSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"email_rem"}', { status: 200 }))

    // Authorized first run emails only the 24h-expiring listing
    const first = await cronPost(new Request('https://nervix.space/api/cron/reminders', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }))
    const j1 = await first.json()
    expect(first.status).toBe(200)
    expect(j1).toMatchObject({ ok: true, checked: 1, sent: 1, failed: 0 })
    expect(mailSpy).toHaveBeenCalledTimes(1)

    // Second run is a clean no-op (already reminded for this featured_until cycle)
    const second = await cronGet(new Request('https://nervix.space/api/cron/reminders', {
      headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
    }))
    const j2 = await second.json()
    expect(second.status).toBe(200)
    expect(j2).toMatchObject({ ok: true, checked: 0, sent: 0, failed: 0 })
    expect(mailSpy).toHaveBeenCalledTimes(1)
  })
})
