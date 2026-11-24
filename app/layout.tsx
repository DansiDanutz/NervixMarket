import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SiteFooter, SiteHeader } from './chrome'
import { body, display } from './fonts'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'https://nervix.space'),
  title: 'Nervix Space · the AI Business Network',
  description: 'List your AI idea, app demo or production-ready app for free. Sell it or take subscriptions with NervixPay, wallet to wallet.',
  alternates: { types: { 'application/rss+xml': '/feed.xml' } },
  openGraph: { siteName: 'Nervix Space', type: 'website', locale: 'en_US' },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = { themeColor: '#04050d', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <SiteHeader />
        <div id="content" tabIndex={-1}>{children}</div>
        <SiteFooter />
      </body>
    </html>
  )
}
