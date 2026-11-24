import Link from 'next/link'
import { CATEGORIES, isFeatured, isVerified, type PublicListing } from '@/lib/listing'
import { Avatar } from './avatar'

const hostOf = (u?: string | null) => { try { return u ? new URL(u).host.replace(/^www\./, '') : '' } catch { return '' } }

/** One directory entry. The host line keeps same-named listings apart (two GrokBots, two different sites). */
export function ListingCard({ l }: { l: PublicListing }) {
  const category = CATEGORIES.find((c) => c.id === l.category)?.label
  const host = hostOf(l.website)
  return (
    <Link href={`/l/${l.slug}`} className={`card ${isFeatured(l) ? 'is-featured' : ''}`}>
      <div className="head">
        <Avatar slug={l.slug} name={l.name} logo={l.logo || undefined} size={44} radius={11} />
        <div>
          <h3>{l.name}</h3>
          {host && <span className="h">{host}</span>}
        </div>
      </div>
      <p className="tag">{l.tagline}</p>
      <div className="meta">
        {l.founding && <span className="pill founding">Founding member</span>}
        {isFeatured(l) && <span className="pill featured">Featured</span>}
        {isVerified(l) && <span className="pill verified">Verified</span>}
        {category && <span className="pill">{category}</span>}
        {l.pay_mode && <span className="pill pay">{l.pay_mode === 'subscribe' ? 'Subscribe' : 'Buy'} · NervixPay</span>}
        {l.offer !== 'use' && <span className="pill sell">{l.offer === 'sell' ? 'For sale' : 'Use or buy'}</span>}
        {l.price && <span className="pill">{l.price}</span>}
      </div>
    </Link>
  )
}
