import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS, readJsonBody } from '@/lib/http'
import { MCP_PROTOCOL_VERSION, MCP_RESOURCES, MCP_SERVER_INFO, MCP_TOOLS, handleMcpMessage } from '@/lib/mcp'
import { ipHash, siteUrl } from '@/lib/owner'
import { RateLimiter } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_MCP_BYTES = 65_536
const mcpLimiter = new RateLimiter(60, 60 * 1000)

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, mcp-session-id, mcp-protocol-version',
} as const

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/** Human/agent-friendly discovery metadata on GET /api/mcp. */
export async function GET() {
  const base = siteUrl()
  return NextResponse.json(
    {
      ...MCP_SERVER_INFO,
      protocolVersion: MCP_PROTOCOL_VERSION,
      transport: 'streamable-http',
      endpoint: `${base}/api/mcp`,
      docs: `${base}/agents`,
      llmsTxt: `${base}/llms.txt`,
      tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
      resources: MCP_RESOURCES.map((r) => ({ uri: r.uri, name: r.name, mimeType: r.mimeType })),
    },
    { headers: { ...CORS_HEADERS, 'cache-control': 'public, max-age=300' } },
  )
}

/** Hosted Streamable HTTP MCP endpoint (JSON-RPC 2.0). Zero install, no API key required. */
export async function POST(req: Request) {
  const lim = mcpLimiter.take(ipHash(req))
  if (!lim.ok) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Rate limit exceeded. Try again shortly.' } },
      { status: 429, headers: { ...CORS_HEADERS, ...NO_STORE_HEADERS, 'retry-after': String(lim.retryAfterS) } },
    )
  }

  const parsed = await readJsonBody(req, MAX_MCP_BYTES)
  if (!parsed.ok) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: parsed.error } },
      { status: parsed.status, headers: { ...CORS_HEADERS, ...NO_STORE_HEADERS } },
    )
  }

  try {
    const response = await handleMcpMessage(parsed.data, req)
    if (response === null) {
      return new NextResponse(null, {
        status: 202,
        headers: { ...CORS_HEADERS, ...NO_STORE_HEADERS, 'mcp-protocol-version': MCP_PROTOCOL_VERSION },
      })
    }
    return NextResponse.json(response, {
      status: 200,
      headers: { ...CORS_HEADERS, ...NO_STORE_HEADERS, 'mcp-protocol-version': MCP_PROTOCOL_VERSION },
    })
  } catch (err) {
    console.error('mcp request failed', err)
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal server error' } },
      { status: 500, headers: { ...CORS_HEADERS, ...NO_STORE_HEADERS } },
    )
  }
}
