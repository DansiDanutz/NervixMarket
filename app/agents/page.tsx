import type { Metadata } from 'next'
import Link from 'next/link'
import { CopySnippet } from '@/components/copy-snippet'
import { MCP_RESOURCES, MCP_TOOLS } from '@/lib/mcp'
import { siteUrl } from '@/lib/owner'
import s from './agents.module.css'

export const metadata: Metadata = {
  title: 'Connect AI Agents · MCP & API · Nervix Space',
  description:
    'Connect Claude, Cursor, Codex, OpenClaw, or your own AI agents to Nervix Space via our zero-install Hosted Streamable HTTP MCP server, REST API, llms.txt, and RSS feed.',
  alternates: { canonical: '/agents' },
  openGraph: {
    title: 'Connect AI Agents to Nervix Space (Hosted MCP & API)',
    description: 'Zero-install Streamable HTTP MCP server, REST API, llms.txt, and RSS feed for discovering and publishing AI builds.',
    url: '/agents',
    siteName: 'Nervix Space',
  },
}

export default function AgentsPage() {
  const base = siteUrl()
  const mcpUrl = `${base}/api/mcp`

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        'nervix-space': {
          type: 'http',
          url: mcpUrl,
        },
      },
    },
    null,
    2,
  )

  const curlExample = [
    `curl -sS ${mcpUrl} \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_listings","arguments":{"q":"payments"}}}'`,
  ].join('\n')

  return (
    <main className={`wrap ${s.page}`}>
      <header className={s.head}>
        <p className="eyebrow">AI-Native Directory · MCP &amp; API</p>
        <h1>Connect your AI agent to Nervix Space</h1>
        <p className={s.sub}>
          Discover AI tools, read pricing and NervixPay checkout links, preview project URLs, or publish new builds straight from
          Claude, Cursor, Codex, OpenClaw, or any MCP-compatible agent. No API key or local install required.
        </p>
      </header>

      <div className={s.grid}>
        <CopySnippet label="Hosted Streamable HTTP MCP URL" code={mcpUrl} />
        <CopySnippet label="Zero-install MCP config (Claude / Cursor / Codex)" code={mcpConfig} />
      </div>

      <section className={s.section} aria-labelledby="tools-title">
        <h2 id="tools-title">MCP Tools ({MCP_TOOLS.length})</h2>
        <p>Available immediately via <code>POST /api/mcp</code> using JSON-RPC 2.0 (protocol <code>2025-03-26</code>).</p>
        <ul className={s.tools}>
          {MCP_TOOLS.map((t) => (
            <li key={t.name}>
              <code>{t.name}</code>
              <span>{t.description}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-labelledby="resources-title">
        <h2 id="resources-title">MCP Resources ({MCP_RESOURCES.length})</h2>
        <ul className={s.tools}>
          {MCP_RESOURCES.map((r) => (
            <li key={r.uri}>
              <code>{r.uri}</code>
              <span>{r.description}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-labelledby="curl-title">
        <h2 id="curl-title">Quick test with curl</h2>
        <CopySnippet label="Search live listings via MCP" code={curlExample} />
      </section>

      <section className={s.section} aria-labelledby="endpoints-title">
        <h2 id="endpoints-title">REST API, Feeds &amp; Discovery</h2>
        <ul className={s.endpoints}>
          <li>
            <a href="/api/mcp">/api/mcp</a>
            <span>Hosted Streamable HTTP MCP server (GET metadata · POST JSON-RPC 2.0)</span>
          </li>
          <li>
            <a href="/llms.txt">/llms.txt</a>
            <span>Machine-readable discovery manifest for LLMs and coding assistants</span>
          </li>
          <li>
            <a href="/feed.xml">/feed.xml</a>
            <span>RSS 2.0 feed of live projects (auto-updating)</span>
          </li>
          <li>
            <a href="/api/listings">/api/listings</a>
            <span>REST directory search (GET) and free listing submission (POST)</span>
          </li>
          <li>
            <a href="/api/badge/nervixpay">/api/badge/:slug</a>
            <span>Embeddable SVG badge for any live listing (README &amp; website backlink)</span>
          </li>
          <li>
            <a href="/api/health">/api/health</a>
            <span>Readiness &amp; database reachability check (200 ok / 503 degraded)</span>
          </li>
        </ul>
      </section>

      <div className={s.ctas}>
        <Link href="/list" className="btn">List your project free</Link>
        <Link href="/sell" className="btn ghost">Sell with NervixPay</Link>
        <Link href="/#directory" className="btn ghost">Explore the directory</Link>
      </div>
    </main>
  )
}
