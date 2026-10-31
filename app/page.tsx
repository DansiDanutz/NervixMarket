import Link from 'next/link'
import { CATEGORIES, OFFERS, search, toPublic, type PublicListing } from '@/lib/listing'
import { MEMBERSHIP_USD } from '@/lib/nervixpay'
import { everything } from '@/lib/store'

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
  return (
    <main>
      <section className="hero wrap">
        <div className="eyebrow">The DansLab AI Business Network</div>
        <h1>List your AI business. <em>Get found, used, or sold.</em></h1>
        <p className="lead">
          Nervix Market is where builders put their AI projects in front of people looking for them: apps, agents,
          tools, and whole businesses for sale. One membership, paid in stablecoins, and you&apos;re in the network.
        </p>
        <div className="ctas">
          <Link href="/list" className="btn">List your AI business · {MEMBERSHIP_USD} USD</Link>
          <a href="#directory" className="btn ghost">Browse the directory</a>
          <span className="price">USDT or USDC · paid with NervixPay</span>
        </div>
        <div className="steps">
          <div><i>01</i><b>Describe it</b><span>Name, what it does, the price, and how people reach you.</span></div>
          <div><i>02</i><b>Pay {MEMBERSHIP_USD} USD in USDT/USDC</b><span>From your own wallet, through NervixPay. Verified on-chain.</span></div>
          <div><i>03</i><b>You&apos;re live</b><span>Your page goes public the moment the payment is confirmed.</span></div>
        </div>
      </section>

      <section className="dir wrap" id="directory">
        <h2>Directory</h2>
        <form className="search" action="/#directory">
          <input name="q" defaultValue={p.q ?? ''} placeholder="Search AI apps, agents, tools…" aria-label="Search" />
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
          : <div className="empty">Nothing matches yet. <Link href="/list">Be the first to list it.</Link></div>}
      </section>
    </main>
  )
}
