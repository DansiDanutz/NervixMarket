import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CATEGORIES, OFFERS, PAY_MODES, isFeatured } from '@/lib/listing'
import { siteUrl } from '@/lib/owner'
import { findLive } from '@/lib/store'
import { Report } from './report'

/** Listing pages are cached and refreshed every minute, and right away when the owner edits. */
export const revalidate = 60
/** No pages at build time; each one is rendered on its first visit, then served from the cache. */
export async function generateStaticParams() { return [] }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const l = await findLive((await params).slug)
  if (!l) return { robots: { index: false } }
  return {
    title: `${l.name} · Nervix Space`, description: l.tagline,
    alternates: { canonical: `/l/${l.slug}` },
    openGraph: { title: l.name, description: l.tagline, url: `/l/${l.slug}`, siteName: 'Nervix Space', ...(l.logo ? { images: [l.logo] } : {}) },
    twitter: { card: 'summary', title: l.name, description: l.tagline },
  }
}

const contactHref = (c: string) =>
  /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(c) ? `mailto:${c}` : /^https:\/\//.test(c) ? c : /^@[A-Za-z0-9_]{1,30}$/.test(c) ? `https://x.com/${c.slice(1)}` : null

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const l = await findLive((await params).slug)
  if (!l) notFound()
  const contact = l.contact ? contactHref(l.contact) : null
  const mode = PAY_MODES.find((m) => m.id === l.pay_mode)
  const ld = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: l.name, description: l.tagline,
    url: l.website, applicationCategory: CATEGORIES.find((c) => c.id === l.category)?.label, ...(l.logo ? { image: l.logo } : {}),
    mainEntityOfPage: `${siteUrl()}/l/${l.slug}`,
  }
  return (
    <main className="wrap page detail">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <Link href="/#directory" className="eyebrow" style={{ textDecoration: 'none' }}>← Directory</Link>
      <div className="head" style={{ marginTop: 16 }}>
        <div className="logo">{l.logo ? <img src={l.logo} alt="" referrerPolicy="no-referrer" loading="lazy" /> : l.name.slice(0, 1)}</div>
        <div>
          <h1 style={{ margin: 0 }}>{l.name}</h1>
          <p className="sub" style={{ margin: 0 }}>{l.tagline}</p>
        </div>
      </div>
      <div className="meta" style={{ marginBottom: 18 }}>
        {l.founding && <span className="pill founding">Founding member</span>}
        {isFeatured(l) && <span className="pill featured">Featured</span>}
        <span className="pill">{CATEGORIES.find((c) => c.id === l.category)?.label}</span>
        <span className={`pill ${l.offer !== 'use' ? 'sell' : ''}`}>{OFFERS.find((o) => o.id === l.offer)?.label}</span>
        {mode && <span className="pill pay">{mode.id === 'subscribe' ? 'Subscription' : 'Buy now'} · NervixPay</span>}
      </div>
      {l.description && <p className="desc">{l.description}</p>}
      <dl className="facts">
        {l.price && <><dt>Price</dt><dd>{l.price}</dd></>}
        <dt>Website</dt><dd><a href={l.website} target="_blank" rel="noopener noreferrer nofollow ugc">{l.website.replace(/^https:\/\//, '')}</a></dd>
        {l.contact && <><dt>Contact</dt><dd>{contact ? <a href={contact} rel="nofollow ugc noopener noreferrer">{l.contact}</a> : l.contact}</dd></>}
      </dl>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {mode && <a className="btn" href={l.pay_link} target="_blank" rel="noopener noreferrer nofollow">{mode.button}{l.price ? ` · ${l.price}` : ''} →</a>}
        <a className={`btn ${mode ? 'ghost' : ''}`} href={l.website} target="_blank" rel="noopener noreferrer nofollow ugc">Visit {l.name} →</a>
        <Link className="btn ghost" href="/list">List yours free</Link>
      </div>
      {mode && <p className="h paynote">Paid wallet to wallet in USDT or USDC, straight to the owner, verified on-chain by NervixPay. Nervix Space never holds the money; check the project before you pay.</p>}
      {!l.founding && (
        <div className="foot-actions">
          {!mode && <span>Own this project? <Link href="/sell">Start taking payments with NervixPay</Link>.</span>}
          <Report id={l.id} />
        </div>
      )}
    </main>
  )
}
