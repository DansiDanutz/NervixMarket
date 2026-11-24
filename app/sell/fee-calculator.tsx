'use client'

import { useState } from 'react'
import { FEE_CAP_USD, feeFor, formatUsd } from '@/lib/fees'
import s from './sell.module.css'

const MAX_PRICE = 1_000_000

/** Live fee breakdown. Server-rendered at the example price; the page also lists fixed examples for no-JS visitors. */
export function FeeCalculator({ initial }: { initial: number }) {
  const [text, setText] = useState(String(initial))
  const r = feeFor(Number(text))
  return (
    <form className={s.calc} aria-labelledby="fees-title" onSubmit={(e) => e.preventDefault()}>
      <h2 id="fees-title">What you keep</h2>
      <label htmlFor="price">Price of one payment, in USD</label>
      <div className={s.calcRow}>
        <span aria-hidden="true">$</span>
        <input id="price" name="price" type="number" inputMode="decimal" min="0.01" max={MAX_PRICE} step="0.01"
          value={text} onChange={(e) => setText(e.target.value)} aria-describedby="fee-result" />
      </div>
      <output id="fee-result" htmlFor="price" className={s.result} aria-live="polite">
        {r ? (
          <dl>
            <div><dt>Buyer pays</dt><dd>{formatUsd(r.price)}</dd></div>
            <div><dt>NervixPay fee (0.2%{r.capped ? `, capped at $${FEE_CAP_USD}` : ''})</dt><dd>{formatUsd(r.fee)}</dd></div>
            <div><dt>Nervix Space fee</dt><dd>$0.00</dd></div>
            <div className={s.keep}><dt>You receive</dt><dd>{formatUsd(r.payout)}</dd></div>
          </dl>
        ) : <p>Enter a price above $0 to see the fee.</p>}
      </output>
    </form>
  )
}
