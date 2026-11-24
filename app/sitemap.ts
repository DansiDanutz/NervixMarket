import type { MetadataRoute } from 'next'
import { FOUNDING } from '@/lib/founding'
import { siteUrl } from '@/lib/owner'
import { store } from '@/lib/store'

/** Rendered per request: the store reads Supabase with `cache: 'no-store'`, which a static render cannot do.
 *  As a static route the fetch threw at build time and on every revalidation, the error was caught, and the
 *  sitemap only ever listed the founding projects. */
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
    { url: `${base}/agents`, changeFrequency: 'monthly', priority: 0.7 },
    ...[...FOUNDING, ...mine].map((l) => ({ url: `${base}/l/${l.slug}`, lastModified: l.created_at, changeFrequency: 'weekly' as const, priority: 0.7 })),
  ]
}
