import Link from 'next/link'
import { CATEGORIES, OFFERS, search, toPublic, type PublicListing } from '@/lib/listing'
import { MEMBERSHIP_USD } from '@/lib/nervixpay'
import { everything, freeLeft } from '@/lib/store'
import { freeSpots } from '@/lib/listing'
import { Logo } from './logo'

export const dynamic = 'force-dynamic'

type SP = Promise<{ q?: string; category?: string; offer?: string }>

const href = (p: { q?: string; category?: string; offer?: string }) => {
  const u = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])
  const s = u.toString()
  return `/${s ? `?${s}` : ''}#directory`
}

function ListingCard({ l }: { l: PublicListing }) {
  const cat = CATEGORIES.find((c) => c.id === l.category)?.label
  return (
    <Link href={`/l/${l.slug}`} className="card">
      <div className="head">
        <div className="logo">{l.logo ? <img src={l.logo} alt="" /> : l.name.slice(0, 1)}</div>
        <div><h3>{l.name}</h3></div>
      </div>
      <p className="tag">{l.tagline}</p>
      <div className="meta">
        {l.founding && <span className="pill founding">Founding member</span>}
        <span className="pill">{cat}</span>
        {l.offer !== 'use' && <span className="pill sell">{l.offer === 'sell' ? 'For sale' : 'Use or buy'}</span>}
        {l.price && <span className="pill">{l.price}</span>}
      </div>
    </Link>
  )
}

export default async function Home({ searchParams }: { searchParams: SP }) {
  const p = await searchParams
  const found = search((await everything()).map(toPublic), p)
  const left = await freeLeft()
  const free = left > 0
  const FREE_SPOTS = freeSpots()
  return (
    <main>
      <section className="hero wrap">
        <div className="hero-grid">
          <div>
            <div className="eyebrow">The DansLab AI Business Network</div>
            <h1>A space for what you build with AI. <em>Show it. Share it. Sell it.</em></h1>
            <p className="lead">
              Nervix Space is where builders bring their AI work into the light: an idea, an app demo, or a
              production-ready app for sale. People come here to find it, use it, or buy it.
            </p>
            <div className="ctas">
              <Link href="/list" className="btn">{free ? 'Take a free spot' : `Join · ${MEMBERSHIP_USD} USD a month`}</Link>
              <a href="#directory" className="btn ghost">Explore the space</a>
            </div>
            {free && (
              <div className="spots" aria-label={`${FREE_SPOTS - left} of ${FREE_SPOTS} founding spots taken`}>
                <div className="bar"><i style={{ width: `${((FREE_SPOTS - left) / FREE_SPOTS) * 100}%` }} /></div>
                <span><b>{left} of {FREE_SPOTS}</b> free founding spots left</span>
              </div>
            )}
          </div>
          <div className="orbit" aria-hidden="true">
            <div className="core"><Logo size={64} /></div>
            <div className="ring r1"><span>Ideas</span></div>
            <div className="ring r2"><span>App demos</span></div>
            <div className="ring r3"><span>Production apps</span></div>
          </div>
        </div>

        <div className="plans">
          <div className={`plan ${free ? 'on' : ''}`}>
            <i>Founding 200</i>
            <b>Listed for free</b>
            <span>The first {FREE_SPOTS} projects in the space are listed free, for good, live the moment they are submitted.{free ? ` ${left} spots left.` : ' All taken.'}</span>
          </div>
          <div className={`plan ${free ? '' : 'on'}`}>
            <i>From project {FREE_SPOTS + 1}</i>
            <b>{MEMBERSHIP_USD} USD a month</b>
            <span>Paid in USDT or USDC through NervixPay, from your own wallet. Verified on-chain, never held by anyone.</span>
          </div>
          <div className="plan">
            <i>Every project</i>
            <b>Its own page</b>
            <span>What it does, the price, and how to reach you. People search by category and come straight to you.</span>
          </div>
        </div>
      </section>

      <section className="dir wrap" id="directory">
        <h2>Explore the space</h2>
        <form className="search" action="/#directory">
          <input name="q" defaultValue={p.q ?? ''} placeholder="Search ideas, app demos, AI apps, agents…" aria-label="Search" />
          {p.category && <input type="hidden" name="category" value={p.category} />}
          {p.offer && <input type="hidden" name="offer" value={p.offer} />}
          <button className="btn ghost" type="submit">Search</button>
        </form>
        <div className="chips">
          <Link className={!p.category ? 'on' : ''} href={href({ ...p, category: undefined })}>All</Link>
          {CATEGORIES.map((c) => <Link key={c.id} className={p.category === c.id ? 'on' : ''} href={href({ ...p, category: c.id })}>{c.label}</Link>)}
          <span className="sep" />
          {OFFERS.filter((o) => o.id !== 'both').map((o) => (
            <Link key={o.id} className={p.offer === o.id ? 'on' : ''} href={href({ ...p, offer: p.offer === o.id ? undefined : o.id })}>{o.label}</Link>
          ))}
        </div>
        {found.length
          ? <div className="grid">{found.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          : <div className="empty">Nothing matches yet. <Link href="/list">Be the first to bring it into the space.</Link></div>}
      </section>
    </main>
  )
}
