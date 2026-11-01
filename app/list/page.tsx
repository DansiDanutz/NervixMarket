import type { Metadata } from 'next'
import { freeSpots } from '@/lib/listing'
import { freeLeft } from '@/lib/store'
import { ListForm } from './form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Join Nervix Space', description: 'Bring your AI project into Nervix Space. The first 200 projects join for free.' }

export default async function ListPage() {
  return <ListForm freeLeft={await freeLeft()} spots={freeSpots()} />
}
