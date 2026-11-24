import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Avatar } from '@/components/avatar'
import { ListingCard } from '@/components/listing-card'
import { CATEGORIES, FEATURE_USD, type PublicListing } from '@/lib/listing'
import { ANY_OFFER, MODE_COOKIE, homeCopy, modeHref, resolveMode, resolveOffer, type Mode } from '@/lib/mode'
import { browse } from '@/lib/store'
import { PrefillDemo } from './home/prefill-demo'
import { RememberMode } from './home/remember-mode'
import s from './home/home.module.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Nervix Space · the AI Business Network',
  description: 'List your AI idea, app demo or production-ready app for free in about 30 seconds. Sell it or take subscriptions with NervixPay, wallet to wallet.',
  alternates: { canonical: '/' },
  openGraph: { title: 'Nervix Space · the AI Business Network', description: 'List your AI build for free: ideas, app demos, production-ready apps. Sell it with NervixPay.', url: '/', siteName: 'Nervix Space' },
}

type Params = { for?: string; q?: string; category?: string; offer?: string; page?: string }
type View = { mode: Mode; q?: string; category?: string; offer?: string }

const MAX_QUERY = 100
const READOUT_SIZE = 3

/** Directory link that keeps the visitor's mode and filters. */
function dirHref(v: View, change: Partial<Omit<View, 'mode'>> & { page?: number }): string {
  const next = { q: v.q, category: v.category, offer: v.offer, ...change }
  const params = new URLSearchParams({ for: v.mode })
  for (const [k, val] of Object.entries(next)) if (val !== undefined && val !== '' && !(k === 'page' && val === 1)) params.set(k, String(val))
  return `/?${params.toString()}#directory`
}

export default async function Home({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams
  const jar = await cookies()
  const mode = resolveMode(p.for, jar.get(MODE_COOKIE)?.value)
  const offer = resolveOffer(mode, p.offer)
  const view: View = { mode, q: p.q?.slice(0, MAX_QUERY) || undefined, category: p.category, offer: p.offer }
  const r = await browse({ q: view.q, category: view.category, offer }, Number(p.page ?? 1))
  const copy = homeCopy(mode)

  return (
    <main>
      {p.for && <RememberMode mode={mode} />}
      <section className={`wrap ${s.hero}`} aria-labelledby="hero-title">
        <div className={s.lead}>
          <p className="eyebrow">The AI Business Network from DansLab</p>
          <nav className={s.modes} aria-label="What brings you here">
            <Link href={modeHref('look', view)} aria-current={mode === 'look' ? 'page' : undefined}>I’m looking for AI tools</Link>
            <Link href={modeHref('build', view)} aria-current={mode === 'build' ? 'page' : undefined}>I’m building one</Link>
          </nav>
          <h1 id="hero-title">{copy.h1}</h1>
          <p className={s.intro}>{copy.lead}</p>
          {mode === 'look'
            ? <SearchForm view={view} big />
            : <p className={s.aside}>Free to list. Optional Buy or Subscribe button with <Link href="/sell">NervixPay</Link>.</p>}
        </div>
        <div className={s.proof}>
          {mode === 'build'
            ? <PrefillDemo />
            : <Readout total={r.total} items={r.items.slice(0, READOUT_SIZE)} filtered={Boolean(view.q || view.category || offer)} mode={mode} />}
        </div>
      </section>

      <Directory view={view} offer={offer} result={r} />
      <Trust />
      <HowItWorks />
      <FinalCta mode={mode} />
    </main>
  )
}

function SearchForm({ view, big = false }: { view: View; big?: boolean }) {
  return (
    <form className={big ? s.find : 'search'} action="/#directory" role="search">
      <label className="sr" htmlFor={big ? 'q-hero' : 'q-dir'}>Search the directory</label>
      <input id={big ? 'q-hero' : 'q-dir'} name="q" defaultValue={view.q ?? ''} maxLength={MAX_QUERY} placeholder="Search ideas, app demos, agents…" />
      <input type="hidden" name="for" value={view.mode} />
      {view.category && <input type="hidden" name="category" value={view.category} />}
      {view.offer && <input type="hidden" name="offer" value={view.offer} />}
      <button className={big ? undefined : 'btn ghost'} type="submit">Search</button>
    </form>
  )
}

/** Product proof for visitors: the directory itself, a few entries, real data only. */
function Readout({ total, items, filtered, mode }: { total: number; items: PublicListing[]; filtered: boolean; mode: Mode }) {
  return (
    <figure className={s.readout}>
      <figcaption>
        <span className={s.live}>{filtered ? 'Filtered' : 'Live'}</span> {total} {total === 1 ? 'project' : 'projects'}{filtered ? ' matching' : ' in the space'}
      </figcaption>
      {items.length > 0 ? (
        <>
          <ul>
            {items.map((l) => (
              <li key={l.id}>
                <Link href={`/l/${l.slug}`}>
                  <Avatar slug={l.slug} name={l.name} logo={l.logo || undefined} size={40} radius={10} />
                  <span><b>{l.name}</b><small>{l.tagline}</small></span>
                </Link>
              </li>
            ))}
          </ul>
          <a className={s.more} href="#directory">See them all</a>
        </>
      ) : (
        <p className={s.aside}>
          No projects match this filter yet.{' '}
          <Link href={`/?for=${mode}&offer=${ANY_OFFER}#directory`}>Show all projects</Link>
        </p>
      )}
    </figure>
  )
}

type Result = Awaited<ReturnType<typeof browse>>

function Directory({ view, offer, result: r }: { view: View; offer?: string; result: Result }) {
  const offers = [{ id: ANY_OFFER, label: 'Anything' }, { id: 'use', label: 'Use it' }, { id: 'sell', label: 'For sale' }]
  const offerOn = (id: string) => (offer ?? ANY_OFFER) === id
  const hasFilters = Boolean(view.q || view.category || offer)
  const resetHref = `/?for=${view.mode}&offer=${ANY_OFFER}#directory`
  return (
    <section className={`wrap ${s.dir}`} id="directory" aria-labelledby="dir-title">
      <div className={s.dirHead}>
        <h2 id="dir-title">Explore the space</h2>
        <span className={s.count}>{r.total} {r.total === 1 ? 'project' : 'projects'}</span>
        {hasFilters && <Link className="clear-link" href={resetHref}>Clear filters</Link>}
      </div>
      {view.mode === 'build' && <SearchForm view={view} />}
      <nav className="chips" aria-label="Category">
        <Link aria-current={!view.category ? 'page' : undefined} href={dirHref(view, { category: undefined })}>All</Link>
        {CATEGORIES.map((c) => (
          <Link key={c.id} aria-current={view.category === c.id ? 'page' : undefined} href={dirHref(view, { category: c.id })}>{c.label}</Link>
        ))}
      </nav>
      <nav className="chips" aria-label="Offer">
        {offers.map((o) => (
          <Link key={o.id} aria-current={offerOn(o.id) ? 'page' : undefined} href={dirHref(view, { offer: o.id })}>{o.label}</Link>
        ))}
      </nav>
      {r.items.length
        ? <div className="grid">{r.items.map((l) => <ListingCard key={l.id} l={l} />)}</div>
        : (
          <div className="empty">
            {hasFilters ? (
              <>No projects match these filters. <Link href={resetHref}>Clear filters</Link> or <Link href="/list">list yours free</Link>.</>
            ) : (
              <>Nothing here yet. <Link href="/list">Be the first to list something in this corner of the space.</Link></>
            )}
          </div>
        )}
      {r.pages > 1 && (
        <nav className="pager" aria-label="Pages">
          {r.page > 1 && <Link className="btn ghost" href={dirHref(view, { page: r.page - 1 })}>Newer</Link>}
          <span>Page {r.page} of {r.pages}</span>
          {r.page < r.pages && <Link className="btn ghost" href={dirHref(view, { page: r.page + 1 })}>Older</Link>}
        </nav>
      )}
    </section>
  )
}

function Trust() {
  return (
    <section className={`wrap ${s.trust}`} aria-labelledby="trust-title">
      <h2 id="trust-title" className="sr">What it costs</h2>
      <ul>
        <li><span>Nervix Space takes</span><b>0%</b><p>Listing is free. No accounts: you get a private manage link.</p></li>
        <li><span>NervixPay charges the seller</span><b>0.2%</b><p>Capped at $2. Nervix Space takes nothing on top.</p></li>
        <li><span>Payments go</span><b>Wallet to wallet</b><p>USDT or USDC, verified on-chain, never custodied.</p></li>
      </ul>
    </section>
  )
}

function HowItWorks() {
  return (
    <section className={`wrap ${s.how}`} aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <ol>
        <li><b>Paste your link</b><span>We read the name, description and logo from your page. About 30 seconds, free.</span></li>
        <li><b>Add NervixPay, if you sell</b><span>Your listing gets a Buy or Subscribe button. Buyers pay your wallet directly.</span></li>
        <li><b>Feature it, if you like</b><span>Featured · {FEATURE_USD} USD / 30 days: shown first in the directory and your category.</span></li>
      </ol>
    </section>
  )
}

function FinalCta({ mode }: { mode: Mode }) {
  return (
    <section className={`wrap ${s.final}`} aria-labelledby="final-title">
      <h2 id="final-title">{mode === 'build' ? 'Your listing is 30 seconds away.' : 'Built something with AI?'}</h2>
      <p>List your AI idea, app demo or production-ready app for free.</p>
      <div className={s.ctas}>
        <Link href="/list" className="btn">List your project free</Link>
        <Link href="/sell" className="btn ghost">Sell with NervixPay</Link>
      </div>
    </section>
  )
}
