import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CATEGORIES, OFFERS, isLive, type Listing } from '@/lib/listing'
import { FOUNDING } from '@/lib/founding'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

async function find(slug: string): Promise<Listing | null> {
  const f = FOUNDING.find((x) => x.slug === slug)
  if (f) return f
  const l = await store().bySlug(slug)
  return l && isLive(l) ? l : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const l = await find((await params).slug)
  return l ? { title: `${l.name} · Nervix Space`, description: l.tagline } : {}
}

const contactHref = (c: string) =>
  /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(c) ? `mailto:${c}` : /^https:\/\//.test(c) ? c : c.startsWith('@') ? `https://x.com/${c.slice(1)}` : null

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const l = await find((await params).slug)
  if (!l) notFound()
  const contact = l.contact ? contactHref(l.contact) : null
  return (
    <main className="wrap page detail">
      <Link href="/#directory" className="eyebrow" style={{ textDecoration: 'none' }}>← Directory</Link>
      <div className="head" style={{ marginTop: 16 }}>
        <div className="logo">{l.logo ? <img src={l.logo} alt="" /> : l.name.slice(0, 1)}</div>
        <div>
          <h1 style={{ margin: 0 }}>{l.name}</h1>
          <p className="sub" style={{ margin: 0 }}>{l.tagline}</p>
        </div>
      </div>
      <div className="meta" style={{ marginBottom: 18 }}>
        {l.founding && <span className="pill founding">Founding member</span>}
        <span className="pill">{CATEGORIES.find((c) => c.id === l.category)?.label}</span>
        <span className={`pill ${l.offer !== 'use' ? 'sell' : ''}`}>{OFFERS.find((o) => o.id === l.offer)?.label}</span>
      </div>
      <p className="desc">{l.description}</p>
      <dl className="facts">
        {l.price && <><dt>Price</dt><dd>{l.price}</dd></>}
        <dt>Website</dt><dd><a href={l.website} target="_blank" rel="noopener noreferrer nofollow">{l.website.replace(/^https:\/\//, '')}</a></dd>
        {l.contact && <><dt>Contact</dt><dd>{contact ? <a href={contact} rel="nofollow">{l.contact}</a> : l.contact}</dd></>}
      </dl>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a className="btn" href={l.website} target="_blank" rel="noopener noreferrer nofollow">Visit {l.name} →</a>
        <Link className="btn ghost" href="/list">List yours</Link>
      </div>
    </main>
  )
}
