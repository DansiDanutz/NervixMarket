import { CATEGORIES } from '@/lib/listing'
import { findLive } from '@/lib/store'
import { OG_SIZE, OG_TYPE, ogCard } from '../../og-card'

export const alt = 'A project on Nervix Space'
export const size = OG_SIZE
export const contentType = OG_TYPE

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const l = await findLive(slug)
  if (!l) return ogCard({ eyebrow: 'Nervix Space', title: 'This page isn’t in the space', line: 'Explore the directory at nervix.space.' })
  return ogCard({
    eyebrow: CATEGORIES.find((c) => c.id === l.category)?.label ?? 'Project',
    title: l.name, line: l.tagline, listing: { slug: l.slug, name: l.name },
  })
}
