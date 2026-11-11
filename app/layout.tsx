import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'
import { Logo } from './logo'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'https://nervix.space'),
  title: 'Nervix Space · the AI Business Network',
  description: 'List your AI idea, app demo or production-ready app for free. Sell it or take subscriptions with NervixPay, wallet to wallet.',
  openGraph: { title: 'Nervix Space', description: 'List your AI build for free: ideas, app demos, production-ready apps. Sell it with NervixPay.', url: '/', siteName: 'Nervix Space' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="sky" aria-hidden="true" />
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand"><Logo /> Nervix <b>Space</b></Link>
            <nav>
              <Link href="/#directory">Explore</Link>
              <Link href="/sell">Sell with NervixPay</Link>
              <Link href="/list" className="btn">List free</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="bot">
          <div className="wrap">
            <span><b className="foot-brand">Nervix Space</b> · nervix.space · part of the DansLab AI Business Network</span>
            <span>Payments by <a href="https://nervixpay.live">NervixPay</a>: wallet to wallet, verified on-chain, never custodied.</span>
          </div>
        </footer>
      </body>
    </html>
  )
}
