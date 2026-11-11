import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/owner'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/manage/', '/feature/', '/pending/'] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
