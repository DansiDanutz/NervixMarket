import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SiteFooter, SiteHeader } from './chrome'
import { body, display } from './fonts'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'https://nervix.space'),
  title: 'Nervix Space · the AI Business Network',
  description: 'List your AI idea, app demo or production-ready app for free. Sell it or take subscriptions with NervixPay, wallet to wallet.',
  openGraph: { title: 'Nervix Space', description: 'List your AI build for free: ideas, app demos, production-ready apps. Sell it with NervixPay.', url: '/', siteName: 'Nervix Space' },
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
