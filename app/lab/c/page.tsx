import Link from 'next/link'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Logo } from '../../logo'
import { Avatar } from '../avatar'
import { COPY, LISTINGS, categoryCounts, categoryLabel, host } from '../data'
import { PrefillDemo } from './demo'
import s from './c.module.css'

const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '700'], display: 'swap', variable: '--c-display' })
const body = Inter({ subsets: ['latin'], display: 'swap', variable: '--c-body' })

type For = 'build' | 'look'

const HERO: Record<For, { h1: string; lead: string }> = {
  build: { h1: 'Paste your link. Your listing is ready.', lead: `${COPY.listFree} ${COPY.paste}` },
  look: { h1: 'AI tools people built, to use or to buy.', lead: 'Ideas, app demos and production-ready apps. Some you can buy or subscribe to, paying the builder directly.' },
}

export default async function LiveNetwork({ searchParams }: { searchParams: Promise<{ for?: string; q?: string }> }) {
  const p = await searchParams
  const who: For = p.for === 'build' ? 'build' : 'look'
  const hero = HERO[who]
  return (
    <div className={`${s.page} ${display.variable} ${body.variable}`}>
      <a className="lab-skip" href="#directory">Skip to directory</a>
      <header className={s.top}>
        <Link href="/lab/c" className={s.brand}><Logo size={26} ring="currentColor" /> Nervix Space</Link>
        <nav className={s.nav} aria-label="Main">
          <a href="#directory">Explore</a><a href="/sell">Sell with NervixPay</a><a href="/list" className={s.cta}>List free</a>
        </nav>
        <details className={s.menu}>
          <summary>Menu</summary>
          <nav aria-label="Main (mobile)"><a href="#directory">Explore</a><a href="/sell">Sell with NervixPay</a><a href="/list">List free</a></nav>
        </details>
      </header>

      <main>
        <section className={s.hero}>
          <nav className={s.choice} aria-label="I am…">
            <a href="?for=look" aria-current={who === 'look' ? 'page' : undefined}>I’m looking for AI tools</a>
            <a href="?for=build" aria-current={who === 'build' ? 'page' : undefined}>I’m building one</a>
          </nav>
          <h1>{hero.h1}</h1>
          <p className={s.lead}>{hero.lead}</p>
          {who === 'build' ? <PrefillDemo /> : (
            <form className={s.find} action="/lab/c#directory" role="search">
              <label htmlFor="c-q" className={s.sr}>Search listings</label>
              <input id="c-q" name="q" defaultValue={p.q ?? ''} placeholder="Search AI apps, agents, demos…" maxLength={100} />
              <input type="hidden" name="for" value="look" />
              <button type="submit">Search</button>
            </form>
          )}
        </section>

        <section id="directory" className={s.dir} aria-labelledby="dir-h">
          <div className={s.dirHead}><h2 id="dir-h">The directory</h2><span>{LISTINGS.length} live</span></div>
          <ul className={s.chips} aria-label="Categories">
            {categoryCounts().map((c) => c.count
              ? <li key={c.id}><a href={`?for=${who}&category=${c.id}#directory`}>{c.label} <b>{c.count}</b></a></li>
              : null)}
            <li><a href="/list" className={s.chipAdd}>+ Add the first in another category</a></li>
          </ul>
          <div className={s.grid}>
            {LISTINGS.map((l) => (
              <a key={l.id} href={`/l/${l.slug}`} className={s.item}>
                <Avatar slug={l.slug} name={l.name} logo={l.logo} size={44} radius={11} />
                <span><b>{l.name}</b><span>{l.tagline}</span><i>{categoryLabel(l.category)} · {host(l.website)}</i></span>
              </a>
            ))}
          </div>
        </section>

        <section className={s.compare} aria-labelledby="cmp-h">
          <h2 id="cmp-h">Add a NervixPay link, get a Buy button</h2>
          <p className={s.illus}>Illustration</p>
          <div className={s.pair}>
            <figure><figcaption>Without</figcaption>
              <div className={s.mini}><Avatar slug="your-project" name="Your project" size={40} radius={10} /><b>Your project</b><span className={s.btnGhost}>Visit →</span></div>
            </figure>
            <figure><figcaption>With NervixPay</figcaption>
              <div className={s.mini}><Avatar slug="your-project" name="Your project" size={40} radius={10} /><b>Your project</b><span className={s.btnBuy}>Buy with NervixPay</span></div>
            </figure>
          </div>
          <ul className={s.facts}>
            <li>{COPY.rails}</li>
            <li>{COPY.fee}</li>
            <li>{COPY.noAccounts}</li>
          </ul>
          <details className={s.notes}>
            <summary>How it works, step by step</summary>
            <ol>
              <li>You create a payment link on NervixPay with your price and the tokens you accept.</li>
              <li>You paste it into your listing and choose one-time purchase or subscription.</li>
              <li>A buyer pays from their wallet straight to yours. NervixPay verifies it on-chain. Nervix Space never holds the money.</li>
            </ol>
          </details>
        </section>

        <section className={s.final}>
          <h2>{who === 'build' ? 'Ready? It takes about 30 seconds.' : 'Built something too?'}</h2>
          <p>Optional: {COPY.featured}.</p>
          <a className={s.primary} href="/list">List your project free</a>
        </section>
      </main>
      <footer className={s.foot}>Nervix Space · the DansLab AI Business Network · Payments by NervixPay</footer>
      <Link className="lab-flag" href="/lab">LAB · C</Link>
    </div>
  )
}
