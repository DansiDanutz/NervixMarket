import Link from 'next/link'
import { CATEGORIES, OFFERS, search, toPublic, type PublicListing } from '@/lib/listing'
import { MEMBERSHIP_USD } from '@/lib/nervixpay'
import { everything, freeLeft } from '@/lib/store'
import { freeSpots } from '@/lib/listing'

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
        <div className="eyebrow">The DansLab AI Business Network</div>
        <h1>A space for what you build with AI. <em>Show it. Share it. Sell it.</em></h1>
        <p className="lead">
          Nervix Space is where builders bring their AI work into the light: an idea, an app demo, or a
          production-ready app for sale. People come here to find it, use it, or buy it.
        </p>
        <div className="ctas">
          <Link href="/list" className="btn">{free ? 'Join the space · free' : `Join the space · ${MEMBERSHIP_USD} USD`}</Link>
          <a href="#directory" className="btn ghost">Explore the space</a>
          <span className="price">{free ? `${left} of ${FREE_SPOTS} free founding spots left` : 'USDT or USDC · paid with NervixPay'}</span>
        </div>
        {free && (
          <div className="spots" aria-label={`${FREE_SPOTS - left} of ${FREE_SPOTS} founding spots taken`}>
            <div className="bar"><i style={{ width: `${((FREE_SPOTS - left) / FREE_SPOTS) * 100}%` }} /></div>
            <span>The first {FREE_SPOTS} projects join for free, for good. <b>{left} spots left.</b></span>
          </div>
        )}
        <div className="steps">
          <div><i>01</i><b>Describe it</b><span>What you built, who it&apos;s for, the price, and how people reach you.</span></div>
          {free
            ? <div><i>02</i><b>Take a founding spot</b><span>Free for the first {FREE_SPOTS} projects. After that, {MEMBERSHIP_USD} USD in USDT/USDC through NervixPay.</span></div>
            : <div><i>02</i><b>Pay {MEMBERSHIP_USD} USD in USDT/USDC</b><span>From your own wallet, through NervixPay. Verified on-chain.</span></div>}
          <div><i>03</i><b>You&apos;re in the space</b><span>Your own page goes live{free ? ' the moment you submit.' : ' the moment the payment is confirmed.'}</span></div>
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
