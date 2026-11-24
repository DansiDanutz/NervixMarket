import type { Metadata } from 'next'
import { genesisStatus } from '@/lib/store'
import { ListForm } from './form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'List your project · Nervix Space',
  description: 'First 200 AI projects list free forever on Nervix Space with a permanent Genesis 200 badge. Sell or take subscriptions with NervixPay.',
  alternates: { canonical: '/list' },
  openGraph: { title: 'List your project · Nervix Space', description: 'First 200 projects list free forever. Paste your link and publish in 30 seconds.', url: '/list', siteName: 'Nervix Space' },
}

export default async function ListPage() {
  const genesis = await genesisStatus()
  return <ListForm genesis={genesis} />
}
