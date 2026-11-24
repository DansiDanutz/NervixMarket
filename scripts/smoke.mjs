#!/usr/bin/env node
/** Permanent production-build E2E smoke test (run via `npm run smoke` and GitHub Actions CI).
 *  Boots the built Next.js server on an ephemeral localhost port against an isolated local file store
 *  and verifies security headers, SSR routes, MCP JSON-RPC, llms.txt, RSS feed, SVG badges, SSRF guards,
 *  and the full listing create -> view -> edit -> delete lifecycle. */

import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const cwd = process.cwd()

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      s.close(() => resolve(addr.port))
    })
  })
}

function assert(cond, msg) {
  if (!cond) throw new Error(`SMOKE FAILED: ${msg}`)
}

const port = await freePort()
const base = `http://127.0.0.1:${port}`

const srv = spawn(
  process.execPath,
  [path.join(cwd, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)],
  {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SITE_URL: base,
      NERVIXPAY_LINK_ID: 'link-ci-smoke',
      NERVIXPAY_WEBHOOK_SECRET: 's'.repeat(64),
      ADMIN_TOKEN: 'ci-smoke-admin-token-123456',
      LISTINGS_PER_HOUR: '50',
      // Force local file store during CI smoke regardless of host env
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let stderrBuf = ''
srv.stderr.on('data', (chunk) => { stderrBuf += chunk.toString() })

async function waitUp() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${base}/api/health`)
      if (r.status === 200) return
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Next.js server did not start on ${base}.\n${stderrBuf}`)
}

let passed = 0
async function step(label, fn) {
  await fn()
  passed++
  console.log(`  ✓ ${label}`)
}

try {
  console.log(`Running Nervix Space production smoke suite against ${base}…`)
  await waitUp()

  await step('GET /api/health returns 200 ok with security headers and no X-Powered-By', async () => {
    const r = await fetch(`${base}/api/health`)
    assert(r.status === 200, `status ${r.status}`)
    const j = await r.json()
    assert(j.ok === true && j.status === 'ok', `unexpected health body ${JSON.stringify(j)}`)
    assert(!r.headers.get('x-powered-by'), 'X-Powered-By header exposed')
    assert(r.headers.get('x-frame-options') === 'DENY', 'missing X-Frame-Options: DENY')
    assert(r.headers.get('x-content-type-options') === 'nosniff', 'missing nosniff')
    assert(Boolean(r.headers.get('content-security-policy')), 'missing CSP')
  })

  for (const p of ['/', '/?for=build', '/list', '/sell', '/agents', '/l/fake-real', '/robots.txt', '/sitemap.xml', '/llms.txt', '/feed.xml', '/opengraph-image']) {
    await step(`GET ${p} returns 200`, async () => {
      const r = await fetch(`${base}${p}`)
      assert(r.status === 200, `${p} returned ${r.status}`)
      const txt = await r.text()
      assert(txt.length > 40, `${p} body unexpectedly short`)
      if (p === '/llms.txt') assert(txt.includes('/api/mcp'), 'llms.txt missing /api/mcp')
      if (p === '/feed.xml') assert(txt.includes('<rss version="2.0"'), 'feed.xml invalid RSS')
    })
  }

  await step('GET /api/badge/nervixpay returns SVG with strict CSP; unknown slug returns 404', async () => {
    const ok = await fetch(`${base}/api/badge/nervixpay`)
    assert(ok.status === 200, `badge status ${ok.status}`)
    assert(ok.headers.get('content-type')?.includes('image/svg+xml'), 'badge wrong content-type')
    assert(ok.headers.get('content-security-policy')?.includes("default-src 'none'"), 'badge missing strict CSP')
    const svg = await ok.text()
    assert(svg.includes('<svg') && svg.includes('Founding'), 'badge SVG missing Founding label')
    const miss = await fetch(`${base}/api/badge/nonexistent-slug-xyz`)
    assert(miss.status === 404, `unknown badge expected 404 got ${miss.status}`)
  })

  await step('GET /api/prefill rejects IPv4-mapped IPv6 SSRF live over HTTP', async () => {
    const r = await fetch(`${base}/api/prefill?url=${encodeURIComponent('https://[::ffff:169.254.169.254]/')}`)
    assert(r.status === 422, `SSRF expected 422 got ${r.status}`)
  })

  let created
  await step('Hosted MCP (/api/mcp): initialize, tools/list, search_listings, resources/read, submit_listing', async () => {
    const meta = await fetch(`${base}/api/mcp`)
    assert(meta.status === 200, `GET /api/mcp status ${meta.status}`)
    const mj = await meta.json()
    assert(mj.transport === 'streamable-http' && mj.tools.length === 5, 'unexpected MCP metadata')

    const rpc = async (body) =>
      fetch(`${base}/api/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

    const init = await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).json()
    assert(init.result?.serverInfo?.name === 'nervix-space', 'MCP initialize failed')

    const notif = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })
    assert(notif.status === 202, `notification expected 202 got ${notif.status}`)

    const list = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()
    assert(list.result?.tools?.length === 5, 'expected 5 MCP tools')

    const search = await (
      await rpc({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'search_listings', arguments: { q: 'crypto' } },
      })
    ).json()
    assert(search.result?.structuredContent?.count >= 1, 'MCP search_listings returned 0 for crypto')

    const guide = await (
      await rpc({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: 'nervix://guide' } })
    ).json()
    assert(guide.result?.contents?.[0]?.text?.includes('Nervix Space'), 'MCP resource read failed')

    const sub = await (
      await rpc({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'submit_listing',
          arguments: {
            name: 'CI Smoke Agent',
            tagline: 'Automated smoke verification agent for Nervix Space.',
            category: 'agents',
            offer: 'both',
            website: 'https://ci-smoke.example.com',
            owner_email: 'ci-smoke@example.com',
            pay_link: 'https://nervixpay.live/l/cismoke1',
            pay_mode: 'subscribe',
          },
        },
      })
    ).json()
    created = sub.result?.structuredContent
    assert(created?.id && created?.slug === 'ci-smoke-agent' && created?.manage, `MCP submit failed: ${JSON.stringify(sub)}`)
  })

  await step('Newly created DB listing renders 200 on /l/<slug>, SVG badge, sitemap, feed, /manage headers, PATCH & DELETE', async () => {
    const page = await fetch(`${base}/l/${created.slug}`)
    assert(page.status === 200, `/l/${created.slug} returned ${page.status} (500 regression!)`)
    const html = await page.text()
    assert(html.includes('CI Smoke Agent') && html.includes('Embed a'), 'listing HTML missing content or badge embed')

    const badge = await fetch(`${base}/api/badge/${created.slug}`)
    assert(badge.status === 200 && (await badge.text()).includes('Listed'), 'created listing badge failed')

    const goVisit = await fetch(`${base}/go/${created.slug}?to=visit`, { redirect: 'manual' })
    assert(goVisit.status === 302 && goVisit.headers.get('location')?.replace(/\/$/, '') === 'https://ci-smoke.example.com', `/go visit redirect failed: ${goVisit.status} ${goVisit.headers.get('location')}`)
    const goPay = await fetch(`${base}/go/${created.slug}?to=pay`, { redirect: 'manual' })
    assert(goPay.status === 302 && goPay.headers.get('location') === 'https://nervixpay.live/l/cismoke1', `/go pay redirect failed: ${goPay.status}`)

    const sm = await (await fetch(`${base}/sitemap.xml`)).text()
    assert(sm.includes(`/l/${created.slug}`), 'sitemap missing created listing')

    const feed = await (await fetch(`${base}/feed.xml`)).text()
    assert(feed.includes('CI Smoke Agent'), 'feed.xml missing created listing')

    const manage = await fetch(`${base}/manage/${created.id}`)
    assert(manage.status === 200 && manage.headers.get('referrer-policy') === 'no-referrer', '/manage headers invalid')

    const tok = created.manage.split('#')[1]
    const pubLookup = await (await fetch(`${base}/api/listings/${created.id}`)).json()
    assert(pubLookup.metrics === undefined, 'public GET /api/listings/[id] leaked metrics')
    const ownLookup = await (await fetch(`${base}/api/listings/${created.id}`, { headers: { 'x-manage-token': tok } })).json()
    assert(
      ownLookup.metrics?.totals?.views >= 1
      && ownLookup.metrics?.totals?.visit_clicks >= 1
      && ownLookup.metrics?.totals?.pay_clicks >= 1
      && ownLookup.metrics?.totals?.badge_loads >= 1,
      `owner metrics missing expected counts: ${JSON.stringify(ownLookup.metrics)}`,
    )

    const cronNoAuth = await fetch(`${base}/api/cron/reminders`)
    assert(cronNoAuth.status === 403, `cron without auth expected 403 got ${cronNoAuth.status}`)
    const cronOk = await fetch(`${base}/api/cron/reminders`, { headers: { authorization: 'Bearer ci-smoke-admin-token-123456' } })
    assert(cronOk.status === 200 && (await cronOk.json()).ok === true, 'cron with admin auth failed')

    const patched = await fetch(`${base}/api/listings/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-manage-token': tok },
      body: JSON.stringify({ pay_mode: 'buy' }),
    })
    assert(patched.status === 200 && (await patched.json()).pay_mode === 'buy', 'PATCH failed')

    const del = await fetch(`${base}/api/listings/${created.id}`, {
      method: 'DELETE',
      headers: { 'x-manage-token': tok },
    })
    assert(del.status === 200, 'DELETE failed')

    const gone = await fetch(`${base}/l/${created.slug}`)
    assert(gone.status === 404, `deleted listing expected 404 got ${gone.status}`)
  })

  console.log(`\nSmoke suite passed (${passed} checks).`)
} finally {
  srv.kill('SIGTERM')
  rmSync(path.join(cwd, '.data'), { recursive: true, force: true })
}
