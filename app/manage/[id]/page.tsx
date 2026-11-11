import type { Metadata } from 'next'
import { Manage } from './manage'

export const metadata: Metadata = { title: 'Manage your listing · Nervix Space', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function ManagePage({ params }: { params: Promise<{ id: string }> }) {
  return <Manage id={(await params).id} />
}
