import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { GET as badgeGET } from '@/app/api/badge/[slug]/route'
import { GET as mcpGET, OPTIONS as mcpOPTIONS, POST as mcpPOST } from '@/app/api/mcp/route'
import { GET as feedGET } from '@/app/feed.xml/route'
import { GET as llmsGET } from '@/app/llms.txt/route'
import { badgeSnippets, renderBadgeSvg } from '@/lib/badge'
import { FOUNDING } from '@/lib/founding'
import { toPublic } from '@/lib/listing'
import { MCP_PROTOCOL_VERSION, MCP_TOOLS } from '@/lib/mcp'
import { FileStore, setStore } from '@/lib/store'
import { escapeXml, renderRssFeed } from '@/lib/xml'

const fileStore = () => {
  const s = new FileStore(path.join(mkdtempSync(path.join(tmpdir(), 'nm-agent-')), 'l.json'))
  setStore(s)
  return s
}

const rpc = (body: unknown, ip = '30.1.1.1') =>
  mcpPOST(
    new Request('http://x/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': ip },
      body: JSON.stringify(body),
    }),
  )

describe('Hosted Streamable HTTP MCP (/api/mcp)', () => {
  beforeEach(() => {
    fileStore()
    process.env.LISTINGS_PER_HOUR = '50'
  })

  it('serves CORS preflight and discovery metadata on GET', async () => {
    const opt = await mcpOPTIONS()
    expect(opt.status).toBe(204)
    expect(opt.headers.get('access-control-allow-origin')).toBe('*')

    const meta = await mcpGET()
    expect(meta.status).toBe(200)
    const j = await meta.json()
    expect(j.protocolVersion).toBe(MCP_PROTOCOL_VERSION)
    expect(j.transport).toBe('streamable-http')
    expect(j.tools).toHaveLength(MCP_TOOLS.length)
  })

  it('handles initialize, ping, notifications, tools/list, and resources', async () => {
    const init = await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).json()
    expect(init.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: { name: 'nervix-space' },
    })

    const notif = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(notif.status).toBe(202)

    const ping = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'ping' })).json()
    expect(ping.result).toEqual({})

    const tools = await (await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' })).json()
    expect(tools.result.tools.map((t: { name: string }) => t.name)).toEqual([
      'search_listings',
      'get_listing',
      'list_categories',
      'preview_url',
      'submit_listing',
    ])

    const resList = await (await rpc({ jsonrpc: '2.0', id: 4, method: 'resources/list' })).json()
    expect(resList.result.resources.map((r: { uri: string }) => r.uri)).toEqual(['nervix://directory', 'nervix://guide'])

    const dir = await (await rpc({ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'nervix://directory' } })).json()
    const parsedDir = JSON.parse(dir.result.contents[0].text)
    expect(parsedDir.count).toBe(FOUNDING.length)

    const guide = await (await rpc({ jsonrpc: '2.0', id: 6, method: 'resources/read', params: { uri: 'nervix://guide' } })).json()
    expect(guide.result.contents[0].text).toContain('/api/mcp')
  })

  it('executes search_listings, get_listing, list_categories, and submit_listing end to end', async () => {
    const cats = await (await rpc({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_categories', arguments: {} } })).json()
    expect(cats.result.structuredContent.total_live).toBe(FOUNDING.length)

    const hit = await (
      await rpc({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'get_listing', arguments: { slug: 'nervixpay' } } })
    ).json()
    expect(hit.result.structuredContent.name).toBe('NervixPay')

    const miss = await (
      await rpc({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'get_listing', arguments: { slug: 'does-not-exist' } } })
    ).json()
    expect(miss.result.isError).toBe(true)

    const badSub = await (
      await rpc({
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: { name: 'submit_listing', arguments: { name: 'X' } },
      })
    ).json()
    expect(badSub.result.isError).toBe(true)

    const goodSub = await (
      await rpc({
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/call',
        params: {
          name: 'submit_listing',
          arguments: {
            name: 'MCP Agent Builder',
            tagline: 'Publishes AI agents straight into Nervix Space.',
            category: 'agents',
            offer: 'use',
            website: 'https://mcp-builder.example.com',
            owner_email: 'builder@example.com',
          },
        },
      })
    ).json()
    expect(goodSub.result.isError).toBeUndefined()
    expect(goodSub.result.structuredContent).toMatchObject({
      slug: 'mcp-agent-builder',
      status: 'active',
    })
    expect(goodSub.result.structuredContent.manage).toContain('/manage/')

    const found = await (
      await rpc({
        jsonrpc: '2.0',
        id: 15,
        method: 'tools/call',
        params: { name: 'search_listings', arguments: { q: 'mcp agent builder' } },
      })
    ).json()
    expect(found.result.structuredContent.count).toBe(1)
    expect(found.result.structuredContent.listings[0].slug).toBe('mcp-agent-builder')
  })

  it('returns proper JSON-RPC errors for invalid methods and rejects private URLs in preview_url', async () => {
    const badMethod = await (await rpc({ jsonrpc: '2.0', id: 20, method: 'unknown/method' })).json()
    expect(badMethod.error.code).toBe(-32601)

    const ssrf = await (
      await rpc({
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: { name: 'preview_url', arguments: { url: 'https://[::ffff:169.254.169.254]/' } },
      })
    ).json()
    expect(ssrf.result.isError).toBe(true)
    expect(ssrf.result.content[0].text).toMatch(/public/i)
  })
})

describe('Embeddable SVG badge, RSS feed, and llms.txt', () => {
  beforeEach(() => {
    fileStore()
  })

  it('renders XML-safe SVG badges for founding, featured, and standard listings', async () => {
    const svgFounding = renderBadgeSvg({ name: 'Fake <Real> & Co', founding: true, featured_until: null })
    expect(svgFounding).toContain('Founding')
    expect(svgFounding).toContain('Fake &lt;Real&gt; &amp; Co')
    expect(svgFounding).not.toContain('<Real>')

    const svgFeatured = renderBadgeSvg({ name: 'Boosted', founding: false, featured_until: '2999-01-01T00:00:00Z' })
    expect(svgFeatured).toContain('Featured')

    const svgListed = renderBadgeSvg({ name: 'Plain', founding: false, featured_until: null })
    expect(svgListed).toContain('Listed')

    const snippets = badgeSnippets('nervixpay', 'NervixPay', 'https://nervix.space')
    expect(snippets.markdown).toBe('[![NervixPay on Nervix Space](https://nervix.space/api/badge/nervixpay)](https://nervix.space/l/nervixpay)')
    expect(snippets.html).toContain('https://nervix.space/api/badge/nervixpay')

    const res = await badgeGET(new Request('http://x/api/badge/nervixpay'), { params: Promise.resolve({ slug: 'nervixpay' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/svg+xml')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")

    const bad = await badgeGET(new Request('http://x/api/badge/..'), { params: Promise.resolve({ slug: '../etc' }) })
    expect(bad.status).toBe(404)
  })

  it('serves valid escaped RSS 2.0 XML on /feed.xml and discovery manifest on /llms.txt', async () => {
    expect(escapeXml('A & B <C> "D" \'E\'\x00')).toBe('A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;')
    const xml = renderRssFeed(FOUNDING.map(toPublic), 'https://nervix.space')
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('https://nervix.space/l/nervixpay')

    const feedRes = await feedGET()
    expect(feedRes.status).toBe(200)
    expect(feedRes.headers.get('content-type')).toContain('application/rss+xml')
    expect(await feedRes.text()).toContain('Fake / Real')

    const llmsRes = await llmsGET()
    expect(llmsRes.status).toBe(200)
    expect(llmsRes.headers.get('content-type')).toContain('text/plain')
    const txt = await llmsRes.text()
    expect(txt).toContain('# Nervix Space')
    expect(txt).toContain('/api/mcp')
    expect(txt).toContain('/feed.xml')
  })
})
