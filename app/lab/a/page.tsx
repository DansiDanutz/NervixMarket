import Link from 'next/link'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Logo } from '../../logo'
import { Avatar } from '../avatar'
import { COPY, LISTINGS, categoryCounts, categoryLabel, host } from '../data'
import s from './a.module.css'

const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '700'], display: 'swap', variable: '--a-display' })
const body = Inter({ subsets: ['latin'], display: 'swap', variable: '--a-body' })

const MODES = [
  { id: 'use', label: 'Use it', figure: String(LISTINGS.length), unit: 'live listings to try', note: 'Ideas, app demos and production-ready apps. Open any of them; no account needed.' },
  { id: 'sale', label: 'For sale', figure: '0%', unit: 'taken by Nervix Space', note: 'Owners can add a Buy or Subscribe button. Buyers pay the owner directly.' },
  { id: 'sell', label: 'Sell with NervixPay', figure: '$2', unit: 'maximum fee per payment', note: 'NervixPay charges the seller 0.2%, capped at $2. USDT or USDC, wallet to wallet.' },
] as const

export default async function MissionControl({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const requested = (await searchParams).mode
  const mode = MODES.find((m) => m.id === requested) ?? MODES[0]
  const proof = LISTINGS.find((l) => l.slug === 'nervixpay')!
  return (
    <div className={`${s.page} ${display.variable} ${body.variable}`}>
      <a className="lab-skip" href="#directory">Skip to directory</a>
      <header className={s.top}>
        <Link href="/lab/a" className={s.brand}><Logo size={28} /> Nervix <span>Space</span></Link>
        <nav className={s.nav} aria-label="Main">
          <a href="#directory">Explore</a>
          <a href="/sell">Sell with NervixPay</a>
          <a href="/list" className={s.cta}>List free</a>
        </nav>
        <details className={s.menu}>
          <summary aria-label="Menu">Menu</summary>
          <nav aria-label="Main (mobile)">
            <a href="#directory">Explore</a>
            <a href="/sell">Sell with NervixPay</a>
            <a href="/list">List free</a>
          </nav>
        </details>
      </header>

      <main>
        <section className={s.hero}>
          <div className={s.heroCopy}>
            <p className={s.label}>{COPY.network}</p>
            <h1>Show what you built with AI. <em>Let people use it, or buy it.</em></h1>
            <p className={s.lead}>{COPY.listFree} {COPY.paste}</p>
            <div className={s.ctas}>
              <a className={s.primary} href="/list">List your project free</a>
              <a className={s.ghost} href="#directory">Explore the directory</a>
            </div>
          </div>

          <figure className={s.readout} aria-label="Example listing">
            <figcaption className={s.label}>Live listing · nervix.space/l/{proof.slug}</figcaption>
            <div className={s.readHead}>
              <Avatar slug={proof.slug} name={proof.name} size={56} radius={14} />
              <div><b>{proof.name}</b><span>{proof.tagline}</span></div>
            </div>
            <dl className={s.fields}>
              <div><dt>Category</dt><dd>{categoryLabel(proof.category)}</dd></div>
              <div><dt>Price</dt><dd>{proof.price}</dd></div>
              <div><dt>Website</dt><dd>{host(proof.website)}</dd></div>
              <div><dt>Listed</dt><dd>Free · founding</dd></div>
            </dl>
          </figure>
        </section>

        <section className={s.modes} aria-label="What are you here for?">
          <nav className={s.tabs} aria-label="Modes">
            {MODES.map((m) => (
              <a key={m.id} href={`?mode=${m.id}#modes`} aria-current={m.id === mode.id ? 'page' : undefined}>{m.label}</a>
            ))}
          </nav>
          <div className={s.gauge} id="modes">
            <b>{mode.figure}</b>
            <span>{mode.unit}</span>
            <p>{mode.note}</p>
          </div>
        </section>

        <section className={s.dir} id="directory" aria-labelledby="dir-h">
          <div className={s.dirHead}>
            <h2 id="dir-h">Directory</h2>
            <span className={s.label}>{LISTINGS.length} live</span>
          </div>
          <form className={s.search} action="/lab/a#directory" role="search">
            <label htmlFor="a-q" className={s.sr}>Search listings</label>
            <input id="a-q" name="q" placeholder="Search ideas, app demos, AI apps, agents…" maxLength={100} />
            <button type="submit">Search</button>
          </form>
          <ul className={s.chips} aria-label="Categories">
            <li><a href="#directory" aria-current="page">All <i>{LISTINGS.length}</i></a></li>
            {categoryCounts().map((c) => (
              <li key={c.id}><a href={`?category=${c.id}#directory`} className={c.count ? '' : s.empty}>{c.label} <i>{c.count}</i></a></li>
            ))}
          </ul>
          <ol className={s.rows}>
            {LISTINGS.map((l) => (
              <li key={l.id}>
                <a href={`/l/${l.slug}`} className={s.row}>
                  <Avatar slug={l.slug} name={l.name} logo={l.logo} size={44} radius={10} />
                  <span className={s.rowMain}><b>{l.name}</b><span>{l.tagline}</span></span>
                  <span className={s.rowMeta}>
                    <span>{categoryLabel(l.category)}</span>
                    <span>{host(l.website)}</span>
                    {l.founding && <span className={s.founding}>Founding</span>}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.trust} aria-labelledby="trust-h">
          <h2 id="trust-h" className={s.sr}>How payments work</h2>
          <div><b>0%</b><span>Nervix Space takes nothing from sales</span></div>
          <div><b>0.2%</b><span>NervixPay seller fee, capped at $2</span></div>
          <div><b>Wallet → wallet</b><span>USDT or USDC, verified on-chain, never custodied</span></div>
        </section>

        <section className={s.final}>
          <h2>Your project, listed in about 30 seconds</h2>
          <p>{COPY.noAccounts} Optional: {COPY.featured}.</p>
          <a className={s.primary} href="/list">List your project free</a>
        </section>
      </main>
      <footer className={s.foot}>Nervix Space · part of the DansLab AI Business Network · Payments by NervixPay</footer>
      <Link className="lab-flag" href="/lab">LAB · A</Link>
    </div>
  )
}
