import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { isLive, listingUsd } from '@/lib/listing'
import { listingCheckoutUrl } from '@/lib/nervixpay'
import { store } from '@/lib/store'
import { PendingPoll } from './poll'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Activate your listing · Nervix Space', robots: { index: false, follow: false } }

/** Standard paid listing checkout (#201+ once Genesis 200 is full).
 *  Redirects straight to the live listing page once activated. */
export default async function Pending({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^lst_[A-Za-z0-9_-]{6,20}$/.test(id)) notFound()
  const l = await store().get(id)
  if (!l || l.status === 'removed' || l.status === 'hidden') notFound()
  if (isLive(l)) redirect(`/l/${encodeURIComponent(l.slug)}`)

  const price = listingUsd()
  const pay = listingCheckoutUrl(l.id)
  return (
    <main className="wrap page">
      <div className="eyebrow">{l.name}</div>
      <h1>Publish your listing permanently.</h1>
      <div className="box">
        <p><span className="status">WAITING FOR PAYMENT</span></p>
        <p>
          All 200 free Genesis spots have been claimed. Complete your one-time <b>{price} USD payment in USDT or USDC</b> via NervixPay to publish <b>{l.name}</b> permanently in the directory, RSS feed, and MCP index.
        </p>
        <p className="h">Wallet to wallet, verified on-chain, 0% Nervix Space cut on your own sales forever.</p>
        <div className="row-actions">
          {pay
            ? <a className="btn" href={pay}>Pay {price} USD with NervixPay →</a>
            : <p className="err">Standard listing checkout is being configured. Contact hello@nervix.space with listing ID <code>{l.id}</code>.</p>}
          <Link className="btn ghost" href="/#directory">Back to directory</Link>
        </div>
        {pay && <PendingPoll id={l.id} />}
      </div>
    </main>
  )
}
