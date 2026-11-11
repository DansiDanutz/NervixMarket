import type { Metadata } from 'next'
import { ListForm } from './form'

export const metadata: Metadata = {
  title: 'List your project · Nervix Space',
  description: 'List your AI project on Nervix Space for free in 30 seconds. Sell it or take subscriptions with NervixPay.',
}

export default function ListPage() {
  return <ListForm />
}
