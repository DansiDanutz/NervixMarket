import type { Metadata } from 'next'
import Link from 'next/link'
import { feeFor, formatUsd } from '@/lib/fees'
import { FeeCalculator } from './fee-calculator'
import s from './sell.module.css'

export const metadata: Metadata = {
  title: 'Sell with NervixPay · Nervix Space',
  description: 'Take crypto payments and subscriptions for your project, straight to your wallet, from your Nervix Space listing.',
  alternates: { canonical: '/sell' },
  openGraph: { title: 'Sell with NervixPay', description: 'A Buy or Subscribe button on your listing. USDT or USDC, wallet to wallet. 0.2% capped at $2.', url: '/sell', siteName: 'Nervix Space' },
}

const EXAMPLE_PRICE = 49
/** Rendered on the server, so the fee is clear even without JavaScript. */
const EXAMPLES = [10, 500, 5_000]

/** How a project owner starts taking payments: their own NervixPay link, pasted into their listing. */
export default function Sell() {
  return (
    <main className={`wrap ${s.page}`}>
      <header className={s.head}>
        <p className="eyebrow">Sell with NervixPay</p>
        <h1>Get paid from your listing</h1>
        <p className={s.sub}>
          Add a Buy or Subscribe button to your Nervix Space page. Buyers pay in USDT or USDC from their own wallet straight
          to yours. NervixPay verifies every payment on-chain and never holds the money. Nervix Space takes nothing.
        </p>
      </header>

      <div className={s.grid}>
        <ol className={s.steps} aria-label="Three steps">
          <li><b>Open NervixPay</b><span>Create a merchant account at nervixpay.live and add the wallet you want to be paid in.</span></li>
          <li><b>Create a payment link</b><span>Set the price and the tokens (USDT, USDC) and networks you accept. Copy the link: nervixpay.live/l/…</span></li>
          <li><b>Paste it in your listing</b><span>On the listing form, or from your private manage link. Choose “One-time purchase” or “Subscription”.</span></li>
        </ol>
        <div id="fees">
          <FeeCalculator initial={EXAMPLE_PRICE} />
          <p className={s.examples}>
            For example: {EXAMPLES.map((p, i) => {
              const r = feeFor(p)
              return r && <span key={p}>{i > 0 && ' · '}{formatUsd(p)} sale, {formatUsd(r.fee)} fee{r.capped ? ' (capped)' : ''}</span>
            })}
          </p>
        </div>
      </div>

      <section className={s.notes} aria-label="Details">
        <div>
          <h2>Subscriptions</h2>
          <p>Crypto wallets can’t be charged automatically, so a subscription on NervixPay is a link your customers pay once per
            period (for example, a monthly price). Turn on “require customer email” on the link so you know who paid, and send
            them the link again when their period ends. NervixPay can also notify your app on every payment with a signed webhook.</p>
        </div>
        <div>
          <h2>Fees</h2>
          <p>NervixPay charges the seller 0.2% per payment, capped at $2. Listing on Nervix Space is free, and Nervix Space takes nothing from your sales.</p>
        </div>
      </section>

      <div className={s.ctas}>
        <a className="btn" href="https://nervixpay.live" target="_blank" rel="noopener noreferrer">Open NervixPay<span className="sr"> (opens in a new tab)</span></a>
        <Link className="btn ghost" href="/list">List your project free</Link>
      </div>
    </main>
  )
}
