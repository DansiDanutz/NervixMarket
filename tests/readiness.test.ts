import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GET as healthGET } from '@/app/api/health/route'
import { GENESIS_WARN_AT, readiness } from '@/lib/readiness'
import { FileStore, setStore } from '@/lib/store'

const KEYS = ['NERVIXPAY_LINK_ID', 'NERVIXPAY_LISTING_LINK_ID', 'NERVIXPAY_WEBHOOK_SECRET', 'RESEND_API_KEY', 'MAIL_FROM'] as const
const genesis = (remaining: number) => ({ cap: 200, claimed: 200 - remaining, remaining, free_open: remaining > 0, listing_usd: 19 })

describe('readiness: can the site take money and mail owners?', () => {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k] } })
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })
  const allSet = () => {
    process.env.NERVIXPAY_LINK_ID = 'feat-link'
    process.env.NERVIXPAY_LISTING_LINK_ID = 'list-link'
    process.env.NERVIXPAY_WEBHOOK_SECRET = 's'.repeat(64)
    process.env.RESEND_API_KEY = 're_test_secret_value'
    process.env.MAIL_FROM = 'Nervix Space <hello@nervix.space>'
  }

  it('is ready when every payment link, the webhook secret and mail are set', () => {
    allSet()
    expect(readiness(genesis(150))).toEqual({
      ready: true, checkout: { featured: true, listing: true, webhook: true }, mail: true,
      genesis: { cap: 200, claimed: 50, remaining: 150 }, warnings: [],
    })
  })

  it('warns about the #201 checkout only once the Genesis spots run low, and loudly when they are gone', () => {
    allSet(); delete process.env.NERVIXPAY_LISTING_LINK_ID
    expect(readiness(genesis(GENESIS_WARN_AT + 1)).warnings).toEqual([])
    expect(readiness(genesis(GENESIS_WARN_AT)).warnings).toEqual([expect.stringMatching(/Only 20 Genesis spots left.*listing #201 will have no way to pay/)])
    const full = readiness(genesis(0))
    expect(full.ready).toBe(false)
    expect(full.warnings).toEqual([expect.stringMatching(/All 200 Genesis spots are taken.*stay pending/)])
  })

  it('flags a missing webhook secret, Featured link and mail', () => {
    const r = readiness(genesis(150))
    expect(r.checkout).toEqual({ featured: false, listing: false, webhook: false })
    expect(r.mail).toBe(false)
    expect(r.warnings.join(' ')).toMatch(/NERVIXPAY_WEBHOOK_SECRET.*NERVIXPAY_LINK_ID.*RESEND_API_KEY/)
  })

  it('/api/health reports readiness without leaking any configured value', async () => {
    allSet(); delete process.env.RESEND_API_KEY
    setStore(new FileStore(path.join(mkdtempSync(path.join(tmpdir(), 'nm-')), 'l.json')))
    const r = await healthGET()
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toMatchObject({ ok: true, readiness: { ready: false, mail: false, checkout: { featured: true, listing: true, webhook: true } } })
    const text = JSON.stringify(body)
    for (const v of ['feat-link', 'list-link', 's'.repeat(64), 'hello@nervix.space']) expect(text).not.toContain(v)
  })
})
