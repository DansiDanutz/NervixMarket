import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FEATURE_USD, isFeatured, isLive } from '@/lib/listing'
import { checkoutUrl, config } from '@/lib/nervixpay'
import { store } from '@/lib/store'
import { Poll } from './poll'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/** Feature a listing: the NervixPay button, then a confirmation once the webhook lands.
 *  Anyone can pay to feature a live listing; it shows nothing private. */
export default async function Feature({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^lst_[A-Za-z0-9_-]{6,20}$/.test(id)) notFound()
  const l = await store().get(id)
  if (!l || !isLive(l)) notFound()
  const featured = isFeatured(l)
  const pay = checkoutUrl(l.id)
  const days = config().featureDays
  return (
    <main className="wrap page">
      <div className="eyebrow">{l.name}</div>
      <h1>{featured ? 'Featured in the space.' : 'Put it at the top of the space.'}</h1>
      <div className="box">
        {featured
          ? <p><span className="status live">FEATURED</span> <span style={{ marginLeft: 8 }}>until {day(l.featured_until!)}</span></p>
          : <p>Featured projects are shown first in the directory and in their category, with a Featured badge, for {days} days.</p>}
        <p>Pay <b>{FEATURE_USD} USD in USDT or USDC</b> through NervixPay, from your own wallet. It is verified on-chain and applied by itself{featured ? `: each payment adds another ${days} days` : ''}.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {pay
            ? <a className="btn" href={pay}>{featured ? 'Extend' : 'Feature it'} · {FEATURE_USD} USD with NervixPay →</a>
            : <p className="err">Featured spots are not switched on yet.</p>}
          <Link className="btn ghost" href={`/l/${l.slug}`}>See the page</Link>
        </div>
        {!featured && pay && <Poll id={l.id} />}
      </div>
    </main>
  )
}
