import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'https://nervix.space'),
  title: 'Nervix Space · the AI Business Network',
  description: 'The space where builders share AI ideas, app demos and production-ready apps, to be used or sold. The first 200 projects join for free.',
  openGraph: { title: 'Nervix Space', description: 'Share your AI build: ideas, app demos, production-ready apps. The first 200 projects join free.', url: '/', siteName: 'Nervix Space' },
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
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand"><i /> Nervix <b>Space</b></Link>
            <nav>
              <Link href="/#directory">Explore</Link>
              <a href="https://nervixpay.live" target="_blank" rel="noreferrer">NervixPay</a>
              <Link href="/list" className="btn">Join the space</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="bot">
          <div className="wrap">
            <span>Nervix Space · part of the DansLab AI Business Network</span>
            <span>Memberships paid with <a href="https://nervixpay.live">NervixPay</a>: wallet to wallet, verified on-chain, never custodied.</span>
          </div>
        </footer>
      </body>
    </html>
  )
}
