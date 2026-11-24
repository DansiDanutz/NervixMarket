import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CATEGORIES, OFFERS, PAY_MODES, isFeatured, isGenesis, isVerified } from '@/lib/listing'
import { siteUrl } from '@/lib/owner'
import { findLive, store } from '@/lib/store'
import { Avatar } from '@/components/avatar'
import { BadgeEmbed } from '@/components/badge-embed'
import { Report } from './report'
import s from './listing.module.css'

/** Rendered per request. The store reads Supabase with `cache: 'no-store'`, which a static (ISR) render
 *  cannot do: Next threw "Page changed from static to dynamic at runtime" and every database listing
 *  returned 500. Caching can come back once the store accepts fetch cache options. */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const l = await findLive((await params).slug)
  if (!l) return { robots: { index: false } }
  return {
    title: `${l.name} · Nervix Space`, description: l.tagline,
    alternates: { canonical: `/l/${l.slug}` },
    openGraph: { title: `${l.name} · Nervix Space`, description: l.tagline, url: `/l/${l.slug}`, siteName: 'Nervix Space' },
    twitter: { card: 'summary_large_image', title: l.name, description: l.tagline },
  }
}

const contactHref = (c: string) =>
  /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(c) ? `mailto:${c}` : /^https:\/\//.test(c) ? c : /^@[A-Za-z0-9_]{1,30}$/.test(c) ? `https://x.com/${c.slice(1)}` : null

const CRAWLER_UA = /googlebot|bingbot|yandexbot|baiduspider|duckduckbot|slurp|semrushbot|ahrefsbot/i

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const l = await findLive((await params).slug)
  if (!l) notFound()
  if (!l.founding) {
    const h = await headers()
    const isPrefetch =
      h.get('next-router-prefetch') !== null
      || h.get('purpose') === 'prefetch'
      || h.get('sec-purpose') === 'prefetch'
    const ua = h.get('user-agent') ?? ''
    if (!isPrefetch && !CRAWLER_UA.test(ua)) {
      await store().recordMetric(l.id, 'views').catch(() => {})
    }
  }
  const contact = l.contact ? contactHref(l.contact) : null
  const mode = PAY_MODES.find((m) => m.id === l.pay_mode)
  const ld = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: l.name, description: l.tagline,
    url: l.website, applicationCategory: CATEGORIES.find((c) => c.id === l.category)?.label, ...(l.logo ? { image: l.logo } : {}),
    mainEntityOfPage: `${siteUrl()}/l/${l.slug}`,
  }
  const host = l.website.replace(/^https:\/\//, '').replace(/\/$/, '')
  const slugEnc = encodeURIComponent(l.slug)
  return (
    <main className={`wrap ${s.page}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <Link href="/#directory" className={s.back}>Back to the directory</Link>
      <header className={s.head}>
        <Avatar slug={l.slug} name={l.name} logo={l.logo || undefined} size={72} radius={18} />
        <div>
          <h1>{l.name}</h1>
          <p className={s.tagline}>{l.tagline}</p>
        </div>
      </header>
      <div className="meta">
        {l.founding && <span className="pill founding">Founding member</span>}
        {isFeatured(l) && <span className="pill featured">Featured</span>}
        {isVerified(l) && <span className="pill verified">Verified site</span>}
        {isGenesis(l) && <span className="pill genesis">Genesis #{l.genesis_number}</span>}
        <span className="pill">{CATEGORIES.find((c) => c.id === l.category)?.label}</span>
        <span className={`pill ${l.offer !== 'use' ? 'sell' : ''}`}>{OFFERS.find((o) => o.id === l.offer)?.label}</span>
        {mode && <span className="pill pay">{mode.id === 'subscribe' ? 'Subscription' : 'Buy now'} · NervixPay</span>}
      </div>

      <div className={s.body}>
        <div>
          {l.description && <p className={s.desc}>{l.description}</p>}
          <dl className="facts">
            {l.price && <><dt>Price</dt><dd>{l.price}</dd></>}
            <dt>Website</dt><dd><a href={l.website} target="_blank" rel="noopener noreferrer nofollow ugc">{host}</a></dd>
            {l.contact && (
              <>
                <dt>Contact</dt>
                <dd>
                  {contact
                    ? contact.startsWith('https://')
                      ? <a href={contact} target="_blank" rel="noopener noreferrer nofollow ugc">{l.contact}</a>
                      : <a href={contact} rel="nofollow ugc">{l.contact}</a>
                    : l.contact}
                </dd>
              </>
            )}
          </dl>
        </div>
        <aside className={s.actions} aria-label="Actions">
          {mode && <a className="btn" href={`/go/${slugEnc}?to=pay`} target="_blank" rel="noopener noreferrer nofollow">{mode.button}{l.price ? ` · ${l.price}` : ''}</a>}
          <a className={`btn ${mode ? 'ghost' : ''}`} href={`/go/${slugEnc}?to=visit`} target="_blank" rel="noopener noreferrer nofollow ugc">Visit {l.name}</a>
          {mode && <p className={s.paynote}>Paid wallet to wallet in USDT or USDC, straight to the owner, verified on-chain by NervixPay. Nervix Space never holds the money; check the project before you pay.</p>}
          <Link className={s.listYours} href="/list">List yours free</Link>
        </aside>
      </div>

      <BadgeEmbed slug={l.slug} name={l.name} baseUrl={siteUrl()} />

      {!l.founding && (
        <div className="foot-actions">
          {!mode && <span>Own this project? <Link href="/sell">Start taking payments with NervixPay</Link>.</span>}
          <Report id={l.id} />
        </div>
      )}
    </main>
  )
}
