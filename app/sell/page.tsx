import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Sell with NervixPay · Nervix Space',
  description: 'Take crypto payments and subscriptions for your project, straight to your wallet, from your Nervix Space listing.',
}

/** How a project owner starts taking payments: their own NervixPay link, pasted into their listing. */
export default function Sell() {
  return (
    <main className="wrap page">
      <div className="eyebrow">Sell with NervixPay</div>
      <h1>Get paid from your listing</h1>
      <p className="sub">Add a Buy or Subscribe button to your Nervix Space page. Buyers pay in USDT or USDC from their own wallet straight to yours. NervixPay verifies every payment on-chain and never holds the money; Nervix Space takes nothing.</p>
      <div className="steps" style={{ marginTop: 0, marginBottom: 26 }}>
        <div><i>01</i><b>Open NervixPay</b><span>Create a merchant account at nervixpay.live and add the wallet you want to be paid in.</span></div>
        <div><i>02</i><b>Create a payment link</b><span>Set the price and the tokens (USDT, USDC) and networks you accept. Copy the link: nervixpay.live/l/…</span></div>
        <div><i>03</i><b>Paste it in your listing</b><span>On the listing form, or from your private manage link. Choose “One-time purchase” or “Subscription”.</span></div>
      </div>
      <div className="box">
        <p><b>Subscriptions.</b> Crypto wallets can’t be charged automatically, so a subscription on NervixPay is a link your customers pay once per period (for example, a monthly price). Turn on “require customer email” on the link so you know who paid, and send them the link again when their period ends. NervixPay can also notify your app on every payment with a signed webhook.</p>
        <p><b>Fees.</b> NervixPay charges the seller 0.2% per payment, capped at $2. Listing on Nervix Space is free.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn" href="https://nervixpay.live" target="_blank" rel="noopener noreferrer">Open NervixPay →</a>
          <Link className="btn ghost" href="/list">List your project free</Link>
        </div>
      </div>
    </main>
  )
}
