import Link from 'next/link'
import { Fraunces, Inter } from 'next/font/google'
import { monogram } from '@/lib/monogram'
import { Logo } from '../../logo'
import { COPY, LISTINGS, categoryCounts, categoryLabel, host } from '../data'
import s from './b.module.css'

const serif = Fraunces({ subsets: ['latin'], weight: ['400', '600'], style: ['normal', 'italic'], display: 'swap', variable: '--b-serif' })
const sans = Inter({ subsets: ['latin'], display: 'swap', variable: '--b-sans' })

/** A tile's cover: the listing's logo, or its monogram set large like a magazine plate. */
function Cover({ slug, name, logo }: { slug: string; name: string; logo: string }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element -- remote owner logos; unoptimized by design
    return <img className={s.cover} src={logo} alt="" referrerPolicy="no-referrer" loading="lazy" />
  }
  const m = monogram(slug, name)
  return <span className={s.cover} aria-hidden="true" style={{ background: `linear-gradient(140deg, ${m.from}, ${m.to})` }}><b>{m.initials}</b></span>
}

export default function Gallery() {
  const [lead, ...rest] = LISTINGS
  return (
    <div className={`${s.page} ${serif.variable} ${sans.variable}`}>
      <a className="lab-skip" href="#index">Skip to the listings</a>
      <header className={s.mast}>
        <Link href="/lab/b" className={s.brand}><Logo size={26} ring="currentColor" /> Nervix Space</Link>
        <nav className={s.nav} aria-label="Main">
          <a href="#index">Explore</a>
          <a href="/sell">Sell with NervixPay</a>
          <a href="/list" className={s.cta}>List free</a>
        </nav>
        <details className={s.menu}>
          <summary>Menu</summary>
          <nav aria-label="Main (mobile)"><a href="#index">Explore</a><a href="/sell">Sell with NervixPay</a><a href="/list">List free</a></nav>
        </details>
      </header>

      <main>
        <section className={s.hero}>
          <p className={s.kicker}>{COPY.network}</p>
          <h1>Things people <em>built with AI</em>, ready to use or to buy.</h1>
          <div className={s.heroFoot}>
            <p>{COPY.listFree} {COPY.paste}</p>
            <div className={s.ctas}>
              <a className={s.primary} href="/list">List your project free</a>
              <a className={s.link} href="#index">Browse the listings ↓</a>
            </div>
          </div>
        </section>

        <section id="index" aria-labelledby="index-h" className={s.issue}>
          <div className={s.issueHead}>
            <h2 id="index-h">In the space now</h2>
            <ul className={s.cats} aria-label="Categories">
              {categoryCounts().filter((c) => c.count).map((c) => <li key={c.id}><a href={`?category=${c.id}#index`}>{c.label} <span>{c.count}</span></a></li>)}
            </ul>
          </div>
          <div className={s.tiles}>
            <a href={`/l/${lead.slug}`} className={`${s.tile} ${s.feature}`}>
              <Cover slug={lead.slug} name={lead.name} logo={lead.logo} />
              <span className={s.meta}>{categoryLabel(lead.category)} · {host(lead.website)}</span>
              <h3>{lead.name}</h3>
              <p>{lead.description || lead.tagline}</p>
            </a>
            {rest.map((l) => (
              <a key={l.id} href={`/l/${l.slug}`} className={s.tile}>
                <Cover slug={l.slug} name={l.name} logo={l.logo} />
                <span className={s.meta}>{categoryLabel(l.category)} · {host(l.website)}</span>
                <h3>{l.name}</h3>
                <p>{l.tagline}</p>
              </a>
            ))}
          </div>
        </section>

        <section className={s.pull} aria-labelledby="pull-h">
          <h2 id="pull-h">Sell it straight from your page.</h2>
          <p>{COPY.pay} {COPY.rails} {COPY.fee}</p>
          <a className={s.link} href="/sell">How selling works →</a>
        </section>

        <section className={s.voice} aria-label="What builders say">
          <p className={s.placeholder}>[[PLACEHOLDER: testimonial, Dan to supply]]</p>
        </section>

        <section className={s.textIndex} aria-labelledby="ti-h">
          <h2 id="ti-h">Every listing</h2>
          <ol>
            {LISTINGS.map((l) => (
              <li key={l.id}><a href={`/l/${l.slug}`}>{l.name}</a><span>{l.tagline}</span><i>{host(l.website)}</i></li>
            ))}
          </ol>
        </section>

        <section className={s.final}>
          <h2>Add yours. It’s free.</h2>
          <p>{COPY.noAccounts} Optional: {COPY.featured}.</p>
          <a className={s.primary} href="/list">List your project free</a>
        </section>
      </main>
      <footer className={s.foot}><span>Nervix Space · part of the DansLab AI Business Network</span><span>Payments by NervixPay: wallet to wallet, verified on-chain, never custodied.</span></footer>
      <Link className="lab-flag" href="/lab">LAB · B</Link>
    </div>
  )
}
