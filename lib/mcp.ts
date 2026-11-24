import { CATEGORIES, FEATURE_USD, OFFERS, isFeatured, toPublic, validate } from './listing'
import { hashToken, ipHash, manageMail, manageUrl, newToken, refresh, sendMail, siteUrl } from './owner'
import { PrefillError, prefill } from './prefill'
import { RateLimiter } from './rate-limit'
import { browse, findLive, store } from './store'

/** Zero-dependency Hosted Streamable HTTP MCP Server (JSON-RPC 2.0) for Nervix Space.
 *  Lets Claude, Cursor, Codex, OpenClaw, and custom AI agents search, inspect, preview, and publish listings. */

export const MCP_PROTOCOL_VERSION = '2025-03-26'
export const MCP_SERVER_INFO = { name: 'nervix-space', version: '1.0.0' } as const

const perHour = () => {
  const n = Number(process.env.LISTINGS_PER_HOUR)
  return Number.isFinite(n) && n > 0 ? n : 5
}

const previewLimiter = new RateLimiter(15, 60 * 1000)

export interface JsonRpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export const MCP_TOOLS = [
  {
    name: 'search_listings',
    description:
      'Search and filter live AI projects, agents, tools, and businesses listed on Nervix Space. Featured and founding listings appear first.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Optional keyword search (matched as word prefixes, max 100 chars).' },
        category: {
          type: 'string',
          enum: CATEGORIES.map((c) => c.id),
          description: 'Optional category filter.',
        },
        offer: {
          type: 'string',
          enum: OFFERS.map((o) => o.id),
          description: 'Optional offer filter: use, sell, or both.',
        },
        page: { type: 'integer', minimum: 1, default: 1, description: '1-based page number (36 listings per page).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_listing',
    description: 'Fetch full public details for a single live Nervix Space listing by its URL slug.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The listing slug (e.g. "nervixpay", "fake-real").' },
      },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_categories',
    description: 'List all Nervix Space categories, offer types, and live listing counts.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'preview_url',
    description: 'Safely extract suggested listing metadata (name, tagline, description, logo) from a public https:// project URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Public https:// URL of the project to preview.' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'submit_listing',
    description:
      'Publish a new AI project listing to Nervix Space for free (goes live immediately). Returns the public page URL and one-time private manage link.',
    inputSchema: {
      type: 'object',
      properties: {
        website: { type: 'string', description: 'Public https:// URL to the project.' },
        name: { type: 'string', description: 'Project name (2–60 chars).' },
        tagline: { type: 'string', description: 'One-line description (8–90 chars).' },
        category: { type: 'string', enum: CATEGORIES.map((c) => c.id), description: 'Project category.' },
        owner_email: { type: 'string', description: 'Private owner email for manage-link recovery (never shown publicly).' },
        offer: { type: 'string', enum: OFFERS.map((o) => o.id), default: 'use', description: 'use, sell, or both.' },
        description: { type: 'string', description: 'Optional detailed description (up to 2000 chars).' },
        price: { type: 'string', description: 'Optional price label (e.g. "Free", "$19/month", "Open source").' },
        contact: { type: 'string', description: 'Optional public contact (email, https:// link, or @handle).' },
        logo: { type: 'string', description: 'Optional public https:// logo image URL.' },
        pay_link: { type: 'string', description: 'Optional NervixPay checkout link (https://nervixpay.live/l/<id>).' },
        pay_mode: { type: 'string', enum: ['buy', 'subscribe'], description: 'Required when pay_link is set: buy or subscribe.' },
      },
      required: ['website', 'name', 'tagline', 'category', 'owner_email'],
      additionalProperties: false,
    },
  },
] as const

export const MCP_RESOURCES = [
  {
    uri: 'nervix://directory',
    name: 'Nervix Space Live Directory',
    description: 'Current page-1 snapshot of live AI tools, agents, and apps listed on Nervix Space.',
    mimeType: 'application/json',
  },
  {
    uri: 'nervix://guide',
    name: 'Nervix Space Agent Integration Guide',
    description: 'How AI agents discover, publish, and monetize projects on Nervix Space using NervixPay.',
    mimeType: 'text/markdown',
  },
] as const

const okResult = (data: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
})

const errResult = (message: string, details?: unknown) => ({
  content: [{ type: 'text', text: details ? `${message}\n${JSON.stringify(details, null, 2)}` : message }],
  isError: true,
})

function buildGuide(base: string): string {
  return [
    '# Nervix Space — Agent Guide',
    '',
    `Nervix Space (${base}) is the AI Business Network from DansLab.`,
    '',
    '## Key facts',
    '- Listing is free for everyone and goes live immediately.',
    '- No accounts: every listing receives a private manage URL (`/manage/<id>#<token>`).',
    '- Sellers can attach a NervixPay checkout link (`https://nervixpay.live/l/<id>`) for one-time or subscription crypto payments (USDT/USDC, wallet to wallet, 0% Nervix Space fee, 0.2% NervixPay fee capped at $2).',
    `- Optional Featured boost: ${FEATURE_USD} USD / 30 days in USDT or USDC via NervixPay.`,
    '',
    '## Machine endpoints',
    `- MCP (Streamable HTTP): ${base}/api/mcp`,
    `- REST API: ${base}/api/listings`,
    `- RSS Feed: ${base}/feed.xml`,
    `- Discovery manifest: ${base}/llms.txt`,
    `- Health check: ${base}/api/health`,
  ].join('\n')
}

async function callTool(name: string, args: Record<string, unknown>, req: Request) {
  const base = siteUrl()

  if (name === 'search_listings') {
    const q = typeof args.q === 'string' ? args.q.slice(0, 100) : undefined
    const category = typeof args.category === 'string' && CATEGORIES.some((c) => c.id === args.category) ? args.category : undefined
    const offer = typeof args.offer === 'string' && OFFERS.some((o) => o.id === args.offer) ? args.offer : undefined
    const page = typeof args.page === 'number' && Number.isInteger(args.page) ? args.page : 1
    const r = await browse({ q, category, offer }, page)
    return okResult({
      count: r.total,
      page: r.page,
      pages: r.pages,
      listings: r.items.map((l) => ({
        ...l,
        url: `${base}/l/${l.slug}`,
        badge_url: `${base}/api/badge/${l.slug}`,
        featured: isFeatured(l),
      })),
    })
  }

  if (name === 'get_listing') {
    const slug = typeof args.slug === 'string' ? args.slug.trim() : ''
    if (!slug || slug.length > 80) return errResult('Provide a valid listing slug.')
    const l = await findLive(slug)
    if (!l) return errResult(`No live listing found for slug "${slug}".`)
    return okResult({
      ...toPublic(l),
      url: `${base}/l/${l.slug}`,
      badge_url: `${base}/api/badge/${l.slug}`,
      featured: isFeatured(l),
    })
  }

  if (name === 'list_categories') {
    const all = await browse({}, 1)
    const counts: Record<string, number> = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]))
    for (const item of all.items) {
      if (item.category in counts) counts[item.category] += 1
    }
    return okResult({
      total_live: all.total,
      categories: CATEGORIES.map((c) => ({ ...c, sample_count: counts[c.id] ?? 0 })),
      offers: OFFERS,
      featured_price_usd: FEATURE_USD,
    })
  }

  if (name === 'preview_url') {
    const url = typeof args.url === 'string' ? args.url.trim() : ''
    if (!url || url.length > 300) return errResult('Paste a full https:// link (max 300 chars).')
    const lim = previewLimiter.take(ipHash(req))
    if (!lim.ok) return errResult(`Rate limit exceeded. Try again in ${lim.retryAfterS}s.`)
    try {
      const data = await prefill(url)
      return okResult(data)
    } catch (e) {
      return errResult(e instanceof PrefillError ? e.message : 'Could not read that page.')
    }
  }

  if (name === 'submit_listing') {
    if (process.env.VERCEL && store().kind === 'file') {
      return errResult('Listings database is temporarily unavailable.')
    }
    const v = validate(args)
    if (!v.ok) return errResult('Validation failed.', v.errors)
    try {
      const ip = ipHash(req)
      if ((await store().recentByIp(ip, new Date(Date.now() - 3_600_000).toISOString())) >= perHour()) {
        return errResult('Rate limit reached: too many listings created from this IP in the last hour.')
      }
      const token = newToken()
      const l = await store().create(v.value, { edit_token_hash: hashToken(token), ip_hash: ip })
      const manage = manageUrl(l.id, token)
      const mailed = await sendMail(l.owner_email, `Your Nervix Space listing: ${l.name}`, manageMail(l.name, manage))
      await refresh('/', '/sitemap.xml', '/feed.xml')
      return okResult({
        id: l.id,
        slug: l.slug,
        status: l.status,
        page: `${base}/l/${l.slug}`,
        badge_url: `${base}/api/badge/${l.slug}`,
        manage,
        mailed,
      })
    } catch (e) {
      console.error('mcp submit_listing failed', e)
      return errResult('Unable to save listing right now. Please try again shortly.')
    }
  }

  return null
}

/** Process one JSON-RPC 2.0 MCP message. Returns null for notifications (caller responds 202). */
export async function handleMcpMessage(raw: unknown, req: Request): Promise<JsonRpcResponse | null> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
  }
  const msg = raw as JsonRpcRequest
  const hasId = Object.prototype.hasOwnProperty.call(msg, 'id')
  const id = hasId ? (msg.id ?? null) : null
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string' || !msg.method) {
    return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request' } }
  }

  // Notifications have no id and require no JSON-RPC response body.
  if (!hasId && msg.method.startsWith('notifications/')) {
    return null
  }

  switch (msg.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {}, resources: {} },
          serverInfo: MCP_SERVER_INFO,
          instructions:
            'Use search_listings and get_listing to discover AI tools and businesses on Nervix Space, preview_url to inspect a project URL, and submit_listing to publish a free listing.',
        },
      }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} }
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } }
    case 'tools/call': {
      const p = msg.params ?? {}
      const name = typeof p.name === 'string' ? p.name : ''
      const args = typeof p.arguments === 'object' && p.arguments !== null && !Array.isArray(p.arguments)
        ? (p.arguments as Record<string, unknown>)
        : {}
      if (!name) {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing tool name' } }
      }
      const res = await callTool(name, args, req)
      if (!res) {
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } }
      }
      return { jsonrpc: '2.0', id, result: res }
    }
    case 'resources/list':
      return { jsonrpc: '2.0', id, result: { resources: MCP_RESOURCES } }
    case 'resources/read': {
      const uri = typeof msg.params?.uri === 'string' ? msg.params.uri : ''
      const base = siteUrl()
      if (uri === 'nervix://directory') {
        const r = await browse({}, 1)
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ count: r.total, listings: r.items }, null, 2) }],
          },
        }
      }
      if (uri === 'nervix://guide') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{ uri, mimeType: 'text/markdown', text: buildGuide(base) }],
          },
        }
      }
      return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown resource: ${uri}` } }
    }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${msg.method}` } }
  }
}
