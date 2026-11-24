import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderBadgeSvg } from '@/lib/badge'
import { isGenesis } from '@/lib/listing'
import { handleMcpMessage } from '@/lib/mcp'
import { FileStore, genesisStatus, setStore } from '@/lib/store'
import { GET as listGet, POST as listPost } from '@/app/api/listings/route'
import { PATCH as patchListing } from '@/app/api/listings/[id]/route'
import { POST as webhookPost } from '@/app/api/webhooks/nervixpay/route'

const signWebhook = (secret: string, body: string) => {
  const t = Math.floor(Date.now() / 1000)
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
}

const sampleBody = (name: string) => ({
  name,
  tagline: `${name} automates workflows with zero setup.`,
  description: 'Production-ready AI tool.',
  category: 'tools',
  offer: 'use',
  price: 'Free',
  website: `https://${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.example.com`,
  contact: 'team@example.com',
  logo: '',
  owner_email: 'founder@example.com',
  pay_link: '',
  pay_mode: '',
})

describe('Genesis 200 cohort & #201 paid listing gate', () => {
  let tmpDir: string
  let fsStore: FileStore
  const envBackup = { ...process.env }

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'nervix-genesis-'))
    fsStore = new FileStore(path.join(tmpDir, 'listings.json'))
    setStore(fsStore)
    process.env.SITE_URL = 'https://nervix.space'
    process.env.FREE_LISTING_CAP = '5' // 4 Founding projects + 1 free Genesis DB slot
    process.env.LISTING_USD = '19'
    process.env.NERVIXPAY_LINK_ID = 'link-featured-10'
    process.env.NERVIXPAY_LISTING_LINK_ID = 'link-listing-19'
    process.env.NERVIXPAY_WEBHOOK_SECRET = 'g'.repeat(64)
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.MAIL_FROM = 'Nervix Space <hello@nervix.space>'
    process.env.LISTINGS_PER_HOUR = '20'
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

  it('awards free Genesis #5 slot under cap, then switches #6 to pending $19 NervixPay checkout', async () => {
    const mailSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"m1"}', { status: 200 }))

    // Before DB submission: 4 Founding claimed, 1 free Genesis slot remaining
    const before = await genesisStatus()
    expect(before).toEqual({ cap: 5, claimed: 4, remaining: 1, free_open: true, listing_usd: 19 })

    // Slot #5 -> active immediately, genesis_number = 5
    const r5 = await listPost(new Request('https://nervix.space/api/listings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '1.1.1.1' },
      body: JSON.stringify(sampleBody('GenesisFive')),
    }))
    const j5 = await r5.json()
    expect(r5.status).toBe(201)
    expect(j5.status).toBe('active')
    expect(j5.genesis_number).toBe(5)
    expect(j5.pay_to_publish).toBeUndefined()

    // SVG badge shows "Genesis 200" for unverified, non-featured Genesis listing
    const svg = renderBadgeSvg({ name: 'GenesisFive', genesis_number: 5, featured_until: null, verified_at: null })
    expect(svg).toContain('Genesis 200')
    expect(isGenesis({ genesis_number: 5 })).toBe(true)

    // GET /api/listings reports 0 remaining spots
    const dirAfter5 = await (await listGet(new Request('https://nervix.space/api/listings'))).json()
    expect(dirAfter5.genesis).toEqual({ cap: 5, claimed: 5, remaining: 0, free_open: false, listing_usd: 19 })

    // Slot #6 (cap full) -> pending payment, no genesis_number, includes checkout_url
    const r6 = await listPost(new Request('https://nervix.space/api/listings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '1.1.1.2' },
      body: JSON.stringify(sampleBody('StandardSix')),
    }))
    const j6 = await r6.json()
    expect(r6.status).toBe(201)
    expect(j6.status).toBe('pending')
    expect(j6.genesis_number).toBeNull()
    expect(j6.pay_to_publish).toBe(`/pending/${j6.id}`)
    expect(j6.checkout_url).toContain('https://nervixpay.live/l/link-listing-19')
    expect(j6.checkout_url).toContain(`ref=${j6.id}`)
    expect(j6.listing_usd).toBe(19)
    expect(mailSpy).toHaveBeenCalledTimes(2)

    // Pending listing is NOT in public directory yet
    const dirPending = await (await listGet(new Request('https://nervix.space/api/listings?q=StandardSix'))).json()
    expect(dirPending.count).toBe(0)

    // Owner CANNOT bypass payment via PATCH { status: 'active' }
    const tok6 = (j6.manage as string).split('#')[1]
    const bypass = await patchListing(
      new Request(`https://nervix.space/api/listings/${j6.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-manage-token': tok6 },
        body: JSON.stringify({ status: 'active' }),
      }),
      { params: Promise.resolve({ id: j6.id }) },
    )
    expect(bypass.status).toBe(402)
  })

  it('activates pending listing on valid signed $19 NervixPay webhook (rejects underpay & ignores duplicates)', async () => {
    const mailSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"m2"}', { status: 200 }))
    process.env.FREE_LISTING_CAP = '4' // All 4 founding spots fill the cap -> next listing is pending

    const created = await (await listPost(new Request('https://nervix.space/api/listings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '2.2.2.2' },
      body: JSON.stringify(sampleBody('PaidLaunch')),
    }))).json()
    expect(created.status).toBe('pending')
    mailSpy.mockClear()

    // Underpaid ($10 instead of $19) must be ignored
    const shortBody = JSON.stringify({
      event: 'payment.paid',
      orderId: 'ord_short_1',
      paymentLinkId: 'link-listing-19',
      customerReference: created.id,
      amountReceived: '10.00',
      currencyToken: 'USDT',
      network: 'TRON',
      transactionId: 'tx_short',
      paidAt: new Date().toISOString(),
    })
    const rShort = await webhookPost(new Request('https://nervix.space/api/webhooks/nervixpay', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nervixpay-signature': signWebhook(process.env.NERVIXPAY_WEBHOOK_SECRET!, shortBody) },
      body: shortBody,
    }))
    expect((await rShort.json()).ignored).toContain('below 19')
    expect((await fsStore.get(created.id))?.status).toBe('pending')

    // Valid $19 payment activates listing + sends 1 receipt email
    const okBody = JSON.stringify({
      event: 'payment.paid',
      orderId: 'ord_list_19',
      paymentLinkId: 'link-listing-19',
      customerReference: created.id,
      amountReceived: '19.00',
      currencyToken: 'USDC',
      network: 'BASE',
      transactionId: 'tx_ok_19',
      paidAt: new Date().toISOString(),
    })
    const sig = signWebhook(process.env.NERVIXPAY_WEBHOOK_SECRET!, okBody)
    const rOk = await webhookPost(new Request('https://nervix.space/api/webhooks/nervixpay', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nervixpay-signature': sig },
      body: okBody,
    }))
    const jOk = await rOk.json()
    expect(rOk.status).toBe(200)
    expect(jOk).toMatchObject({ ok: true, kind: 'listing', status: 'active', mailed: true })
    expect((await fsStore.get(created.id))?.status).toBe('active')
    expect(mailSpy).toHaveBeenCalledTimes(1)

    // Duplicate retry does not send another email
    const rDup = await webhookPost(new Request('https://nervix.space/api/webhooks/nervixpay', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nervixpay-signature': sig },
      body: okBody,
    }))
    expect((await rDup.json()).duplicate).toBe(true)
    expect(mailSpy).toHaveBeenCalledTimes(1)

    // Now visible in public directory
    const dirLive = await (await listGet(new Request('https://nervix.space/api/listings?q=PaidLaunch'))).json()
    expect(dirLive.count).toBe(1)
  })

  it('exposes Genesis 200 status and pending checkout metadata over MCP', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"m3"}', { status: 200 }))
    process.env.FREE_LISTING_CAP = '4'

    const cats = await handleMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_categories', arguments: {} } },
      new Request('https://nervix.space/api/mcp', { method: 'POST' }),
    )
    const catsContent = (cats?.result as { structuredContent?: { genesis?: { free_open: boolean; cap: number } } })?.structuredContent
    expect(catsContent?.genesis).toMatchObject({ cap: 4, free_open: false })

    const sub = await handleMcpMessage(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'submit_listing', arguments: sampleBody('AgentPaid') } },
      new Request('https://nervix.space/api/mcp', { method: 'POST', headers: { 'x-real-ip': '3.3.3.3' } }),
    )
    const subContent = (sub?.result as { structuredContent?: { status: string; pay_to_publish?: string; listing_usd?: number } })?.structuredContent
    expect(subContent?.status).toBe('pending')
    expect(subContent?.pay_to_publish).toContain('/pending/')
    expect(subContent?.listing_usd).toBe(19)
  })
})
