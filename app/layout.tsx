import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nervix Market · the AI Business Network',
  description: 'List your AI project to be used or sold, in the DansLab AI Business Network. Membership 10 USD in USDT or USDC, paid with NervixPay.',
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
            <Link href="/" className="brand"><i /> Nervix <b>Market</b></Link>
            <nav>
              <Link href="/#directory">Directory</Link>
              <a href="https://nervixpay.live" target="_blank" rel="noreferrer">NervixPay</a>
              <Link href="/list" className="btn">List your AI business</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="bot">
          <div className="wrap">
            <span>Nervix Market · part of the DansLab AI Business Network</span>
            <span>Memberships paid with <a href="https://nervixpay.live">NervixPay</a>: wallet to wallet, verified on-chain, never custodied.</span>
          </div>
        </footer>
      </body>
    </html>
  )
}
