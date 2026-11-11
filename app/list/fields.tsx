'use client'

import { CATEGORIES, OFFERS, PAY_MODES } from '@/lib/listing'

export type Values = Record<string, string>
export type Errors = Record<string, string>

export const EMPTY: Values = {
  website: '', name: '', tagline: '', description: '', category: '', offer: 'use', price: '', contact: '',
  logo: '', owner_email: '', pay_link: '', pay_mode: 'buy',
}

export function Field({ name, label, hint, errors, children }: { name: string; label: string; hint?: string; errors: Errors; children: React.ReactNode }) {
  return (
    <label>
      {label} {hint && <span className="h">{hint}</span>}
      {children}
      {errors[name] && <span className="err">{errors[name]}</span>}
    </label>
  )
}

/** The listing fields, shared by /list and /manage. Controlled, so the autofill can fill them in. */
export function ListingFields({ v, set, errors, withEmail }: { v: Values; set: (k: string, val: string) => void; errors: Errors; withEmail: boolean }) {
  const bind = (k: string) => ({ name: k, value: v[k] ?? '', className: errors[k] ? 'bad' : undefined, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value) })
  const more = !!(errors.description || errors.price || errors.contact || errors.logo || errors.offer)
  return (
    <>
      <div className="two">
        <Field name="name" label="Name" errors={errors}><input {...bind('name')} maxLength={60} required /></Field>
        <Field name="category" label="Category" errors={errors}>
          <select {...bind('category')} required>
            <option value="" disabled>Choose…</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
      </div>
      <Field name="tagline" label="One line" hint="what it does, in under 90 characters" errors={errors}><input {...bind('tagline')} maxLength={90} required /></Field>
      {withEmail && <Field name="owner_email" label="Your email" hint="your private edit link goes here; never shown" errors={errors}><input {...bind('owner_email')} type="email" required /></Field>}

      <details className="more" open={more || undefined}>
        <summary>More details <span className="h">description, price, contact, logo (optional)</span></summary>
        <div className="f inner">
          <Field name="description" label="Description" hint="who it's for, what it does, what makes it good" errors={errors}><textarea {...bind('description')} maxLength={2000} /></Field>
          <div className="two">
            <Field name="offer" label="People can…" errors={errors}>
              <select {...bind('offer')}>
                {OFFERS.map((o) => <option key={o.id} value={o.id}>{o.id === 'use' ? 'Use it' : o.id === 'sell' ? 'Buy the project / business' : 'Use it or buy it'}</option>)}
              </select>
            </Field>
            <Field name="price" label="Price" hint="'$19/month', 'Free', 'Asking $25k'" errors={errors}><input {...bind('price')} maxLength={60} /></Field>
          </div>
          <div className="two">
            <Field name="contact" label="Public contact" hint="email, Telegram, X handle or link" errors={errors}><input {...bind('contact')} maxLength={120} /></Field>
            <Field name="logo" label="Logo link" hint="https:// image" errors={errors}><input {...bind('logo')} type="url" maxLength={300} /></Field>
          </div>
        </div>
      </details>

      <fieldset className="paybox">
        <legend>Get paid with NervixPay <span className="h">optional</span></legend>
        <p className="h">Sell it or charge a subscription right from your listing. Buyers pay from their wallet straight to yours in USDT or USDC; NervixPay never holds the money.
          {' '}<a href="https://nervixpay.live" target="_blank" rel="noopener noreferrer">Create a free payment link on NervixPay →</a></p>
        <Field name="pay_link" label="Your NervixPay payment link" hint="https://nervixpay.live/l/…" errors={errors}>
          <input {...bind('pay_link')} type="url" placeholder="https://nervixpay.live/l/…" maxLength={300} />
        </Field>
        {v.pay_link && (
          <div className="modes" role="radiogroup" aria-label="Payment type">
            {PAY_MODES.map((m) => (
              <label key={m.id} className={v.pay_mode === m.id ? 'on' : ''}>
                <input type="radio" name="pay_mode" value={m.id} checked={v.pay_mode === m.id} onChange={() => set('pay_mode', m.id)} />
                {m.id === 'buy' ? 'One-time purchase' : 'Subscription'}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </>
  )
}
