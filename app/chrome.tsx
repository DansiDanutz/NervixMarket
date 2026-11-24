import Link from 'next/link'
import { Logo } from './logo'
import s from './chrome.module.css'

const LINKS = [
  { href: '/#directory', label: 'Explore' },
  { href: '/sell', label: 'Sell with NervixPay' },
] as const

export function SiteHeader() {
  return (
    <header className={s.top}>
      <a className={s.skip} href="#content">Skip to content</a>
      <div className={`wrap ${s.bar}`}>
        <Link href="/" className={s.brand} aria-label="Nervix Space, home"><Logo /> Nervix <span>Space</span></Link>
        <nav className={s.nav} aria-label="Main">
          {LINKS.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
          <Link href="/list" className={s.cta}>List free</Link>
        </nav>
        <details className={s.menu}>
          <summary>Menu</summary>
          {/* Plain links: a full navigation closes the menu, with or without JavaScript. */}
          <nav aria-label="Main">
            {LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
            <a href="/list">List your project free</a>
          </nav>
        </details>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className={s.bot}>
      <div className={`wrap ${s.cols}`}>
        <div>
          <b>Nervix Space</b>, the AI Business Network from DansLab.
          <p className={s.pay}>Payments by <a href="https://nervixpay.live">NervixPay</a>: wallet to wallet, verified on-chain, never custodied.</p>
        </div>
        <ul className={s.links} aria-label="Site">
          <li><Link href="/#directory">Explore</Link></li>
          <li><Link href="/list">List free</Link></li>
          <li><Link href="/sell">Sell with NervixPay</Link></li>
          <li><Link href="/agents">API &amp; MCP</Link></li>
          <li><a href="/feed.xml">RSS</a></li>
        </ul>
      </div>
    </footer>
  )
}
