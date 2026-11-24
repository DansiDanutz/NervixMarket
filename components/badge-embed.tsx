import { badgeSnippets } from '@/lib/badge'
import { CopySnippet } from './copy-snippet'

/** Collapsible "Embed badge" panel on listing pages and post-publish confirmation. */
export function BadgeEmbed({
  slug,
  name,
  baseUrl,
  defaultOpen = false,
}: {
  slug: string
  name: string
  baseUrl: string
  defaultOpen?: boolean
}) {
  const snippets = badgeSnippets(slug, name, baseUrl)
  return (
    <details className="more badge-embed" open={defaultOpen || undefined}>
      <summary>
        Embed a &ldquo;Listed on Nervix Space&rdquo; badge <span className="h">for your README or site</span>
      </summary>
      <div className="badge-body">
        <div className="badge-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- local dynamic SVG badge */}
          <img src={`/api/badge/${encodeURIComponent(slug)}`} alt={`${name} on Nervix Space`} height={28} />
        </div>
        <CopySnippet label="Markdown (GitHub README)" code={snippets.markdown} inline />
        <CopySnippet label="HTML" code={snippets.html} inline />
      </div>
    </details>
  )
}
