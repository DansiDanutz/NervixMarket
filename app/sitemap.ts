import type { MetadataRoute } from 'next'
import { FOUNDING } from '@/lib/founding'
import { siteUrl } from '@/lib/owner'
import { store } from '@/lib/store'

/** Rendered on request: it reads the database with uncached queries (see app/l/[slug]/page.tsx). */
export const dynamic = 'force-dynamic'

/** Every live listing, so search engines find the projects people list for free. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  let mine: { slug: string; created_at: string }[] = []
  try { mine = (await store().search({}, 5000, 0)).items } catch (e) { console.error('sitemap: listings unavailable', e) }
  return [
    { url: `${base}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/list`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/sell`, changeFrequency: 'monthly', priority: 0.6 },
    ...[...FOUNDING, ...mine].map((l) => ({ url: `${base}/l/${l.slug}`, lastModified: l.created_at, changeFrequency: 'weekly' as const, priority: 0.7 })),
  ]
}
