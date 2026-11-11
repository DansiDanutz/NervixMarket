import Link from 'next/link'
import { CATEGORIES, FEATURE_USD, OFFERS, isFeatured, type PublicListing } from '@/lib/listing'
import { browse } from '@/lib/store'
import { Logo } from './logo'

export const dynamic = 'force-dynamic'

type P = { q?: string; category?: string; offer?: string; page?: string }

const href = (p: P) => {
  const u = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])
  const s = u.toString()
  return `/${s ? `?${s}` : ''}#directory`
}

function ListingCard({ l }: { l: PublicListing }) {
  const cat = CATEGORIES.find((c) => c.id === l.category)?.label
  return (
    <Link href={`/l/${l.slug}`} className={`card ${isFeatured(l) ? 'is-featured' : ''}`}>
      <div className="head">
        <div className="logo">{l.logo ? <img src={l.logo} alt="" referrerPolicy="no-referrer" loading="lazy" /> : l.name.slice(0, 1)}</div>
        <div><h3>{l.name}</h3></div>
      </div>
      <p className="tag">{l.tagline}</p>
      <div className="meta">
        {l.founding && <span className="pill founding">Founding member</span>}
        {isFeatured(l) && <span className="pill featured">Featured</span>}
        <span className="pill">{cat}</span>
        {l.pay_mode && <span className="pill pay">{l.pay_mode === 'subscribe' ? 'Subscribe' : 'Buy'} · NervixPay</span>}
        {l.offer !== 'use' && <span className="pill sell">{l.offer === 'sell' ? 'For sale' : 'Use or buy'}</span>}
        {l.price && <span className="pill">{l.price}</span>}
      </div>
    </Link>
  )
}

export default async function Home({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams
  const q = { q: p.q?.slice(0, 100), category: p.category, offer: p.offer }
  const r = await browse(q, Number(p.page ?? 1))
  return (
    <main>
      <section className="hero wrap">
        <div className="hero-grid">
          <div>
            <div className="eyebrow">The DansLab AI Business Network</div>
            <h1>A space for what you build with AI. <em>Show it. Share it. Sell it.</em></h1>
            <p className="lead">
              List your idea, app demo or production-ready app for free, in 30 seconds. People come here to find it,
              use it, buy it, or subscribe to it, paying you directly with NervixPay.
            </p>
            <div className="ctas">
              <Link href="/list" className="btn">List your project free</Link>
              <a href="#directory" className="btn ghost">Explore the space</a>
            </div>
          </div>
          <div className="orbit" aria-hidden="true">
            <div className="core"><Logo size={64} /></div>
            <div className="ring r1"><span>Ideas</span></div>
            <div className="ring r2"><span>App demos</span></div>
            <div className="ring r3"><span>Production apps</span></div>
          </div>
        </div>

        <div className="plans">
          <div className="plan on">
            <i>Every project</i>
            <b>Listed free</b>
            <span>Paste your link, we fill in the rest. Your page is live at once, and you can edit, pause or delete it any time.</span>
          </div>
          <div className="plan">
            <i>Sell or subscribe</i>
            <b>Paid with NervixPay</b>
            <span>Add your NervixPay link and get a Buy or Subscribe button. USDT or USDC, wallet to wallet, straight to you. <Link href="/sell">How it works</Link></span>
          </div>
          <div className="plan">
            <i>Optional boost</i>
            <b>Featured · {FEATURE_USD} USD</b>
            <span>Shown first in the directory and your category for a month. Paid with NervixPay too.</span>
          </div>
        </div>
      </section>

      <section className="dir wrap" id="directory">
        <h2>Explore the space <span className="count">{r.total} projects</span></h2>
        <form className="search" action="/#directory">
          <input name="q" defaultValue={p.q ?? ''} placeholder="Search ideas, app demos, AI apps, agents…" aria-label="Search" maxLength={100} />
          {p.category && <input type="hidden" name="category" value={p.category} />}
          {p.offer && <input type="hidden" name="offer" value={p.offer} />}
          <button className="btn ghost" type="submit">Search</button>
        </form>
        <div className="chips">
          <Link className={!p.category ? 'on' : ''} href={href({ ...q, category: undefined })}>All</Link>
          {CATEGORIES.map((c) => <Link key={c.id} className={p.category === c.id ? 'on' : ''} href={href({ ...q, category: c.id })}>{c.label}</Link>)}
          <span className="sep" />
          {OFFERS.filter((o) => o.id !== 'both').map((o) => (
            <Link key={o.id} className={p.offer === o.id ? 'on' : ''} href={href({ ...q, offer: p.offer === o.id ? undefined : o.id })}>{o.label}</Link>
          ))}
        </div>
        {r.items.length
          ? <div className="grid">{r.items.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          : <div className="empty">Nothing matches yet. <Link href="/list">Be the first to bring it into the space.</Link></div>}
        {r.pages > 1 && (
          <nav className="pager" aria-label="Pages">
            {r.page > 1 && <Link className="btn ghost" href={href({ ...q, page: String(r.page - 1) })}>← Newer</Link>}
            <span>Page {r.page} of {r.pages}</span>
            {r.page < r.pages && <Link className="btn ghost" href={href({ ...q, page: String(r.page + 1) })}>Older →</Link>}
          </nav>
        )}
      </section>
    </main>
  )
}
