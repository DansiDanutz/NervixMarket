import type { Metadata } from 'next'
import { ListForm } from './form'

export const metadata: Metadata = {
  title: 'List your project · Nervix Space',
  description: 'List your AI project on Nervix Space for free in 30 seconds. Sell it or take subscriptions with NervixPay.',
  alternates: { canonical: '/list' },
  openGraph: { title: 'List your project free · Nervix Space', description: 'Paste your link and we fill in the name, description and logo. Free, live at once.', url: '/list', siteName: 'Nervix Space' },
}

export default function ListPage() {
  return <ListForm />
}
