import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isLive } from '@/lib/listing'
import { checkoutUrl, config } from '@/lib/nervixpay'
import { store } from '@/lib/store'
import { Poll } from './poll'

export const dynamic = 'force-dynamic'

/** After the form: the pay button, then "you're live" once the webhook lands. The id in the URL
 *  is the only key to this page; it shows nothing private. */
export default async function Pending({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^lst_[A-Za-z0-9_-]{6,20}$/.test(id)) notFound()
  const l = await store().get(id)
  if (!l || l.status === 'hidden') notFound()
  const live = isLive(l)
  const pay = checkoutUrl(l.id, l.owner_email)
  const days = config().membershipDays
  return (
    <main className="wrap page">
      <div className="eyebrow">{l.name}</div>
      <h1>{live ? 'You’re in the network.' : 'One step left: the membership.'}</h1>
      <div className="box">
        <p><span className={`status ${live ? 'live' : ''}`}>{live ? 'LIVE' : 'WAITING FOR PAYMENT'}</span></p>
        {live ? (
          <>
            <p>Your listing is public until {new Date(l.paid_until!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
            <Link className="btn" href={`/l/${l.slug}`}>See your page →</Link>
          </>
        ) : (
          <>
            <p>Pay <b>10 USD in USDT or USDC</b> through NervixPay. You pay from your own wallet; the payment is verified on-chain and your page goes live by itself, for {days} days. Keep this page open, or come back to it later.</p>
            {pay
              ? <a className="btn" href={pay}>Pay 10 USD with NervixPay →</a>
              : <p className="err">Payments are not switched on yet (the membership payment link is missing). Your listing is saved.</p>}
            <Poll id={l.id} />
          </>
        )}
      </div>
    </main>
  )
}
