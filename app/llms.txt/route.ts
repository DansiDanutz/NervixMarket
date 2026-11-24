import { NextResponse } from 'next/server'
import { CATEGORIES, FEATURE_USD } from '@/lib/listing'
import { siteUrl } from '@/lib/owner'
import { browse } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Machine-readable discovery file (https://llmstxt.org) for AI agents and search assistants. */
export async function GET() {
  const base = siteUrl()
  const dir = await browse({}, 1)
  const sample = dir.items
    .slice(0, 12)
    .map((l) => `- [${l.name}](${base}/l/${l.slug}): ${l.tagline}${l.price ? ` (${l.price})` : ''}`)

  const body = [
    '# Nervix Space',
    '',
    '> The AI Business Network from DansLab. List an AI idea, app demo, or production-ready app for free in 30 seconds. Sell it or take subscriptions wallet-to-wallet with NervixPay (0% Nervix Space fee; 0.2% NervixPay fee capped at $2).',
    '',
    `Live projects currently listed: ${dir.total}`,
    '',
    '## Connect an AI Agent (Hosted MCP)',
    `- [Hosted Streamable HTTP MCP Endpoint](${base}/api/mcp): Zero-install JSON-RPC 2.0 MCP server (\`search_listings\`, \`get_listing\`, \`list_categories\`, \`preview_url\`, \`submit_listing\`, plus \`nervix://directory\` and \`nervix://guide\` resources).`,
    `- [Agent & Developer Docs](${base}/agents): Copy-paste MCP configs for Claude Desktop, Cursor, Codex, and OpenClaw.`,
    '',
    '## REST API & Feeds',
    `- [Search Listings JSON](${base}/api/listings): \`GET /api/listings?q=&category=&offer=&page=\` (public live listings, featured first).`,
    `- [Submit Listing](${base}/api/listings): \`POST /api/listings\` (free, live immediately; returns one-time \`/manage/<id>#<token>\` link).`,
    `- [URL Metadata Prefill](${base}/api/prefill): \`GET /api/prefill?url=https://…\` (SSRF-hardened metadata preview).`,
    `- [RSS 2.0 Feed](${base}/feed.xml): Subscribe to live AI projects.`,
    `- [Sitemap](${base}/sitemap.xml): Full list of live project URLs.`,
    `- [Health Check](${base}/api/health): Readiness & database status.`,
    '',
    '## Categories',
    ...CATEGORIES.map((c) => `- \`${c.id}\`: ${c.label}`),
    '',
    '## Pricing & Monetization',
    '- Listing: Free forever, no account required.',
    '- Selling / Subscriptions: Paste your own `https://nervixpay.live/l/<id>` checkout link. Buyers pay wallet-to-wallet in USDT/USDC; Nervix Space takes 0%.',
    `- Featured spot: ${FEATURE_USD} USD / 30 days via NervixPay (optional boost shown first in directory & category).`,
    '',
    '## Featured & Live Projects',
    ...sample,
    '',
  ].join('\n')

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=600',
    },
  })
}
