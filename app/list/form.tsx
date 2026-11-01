'use client'

import { useState } from 'react'
import { CATEGORIES, OFFERS } from '@/lib/listing'

type Errors = Record<string, string>

function Field({ name, label, hint, errors, children }: { name: string; label: string; hint?: string; errors: Errors; children: React.ReactNode }) {
  return (
    <label>
      {label} {hint && <span className="h">{hint}</span>}
      {children}
      {errors[name] && <span className="err">{errors[name]}</span>}
    </label>
  )
}

/** Submit a listing. While free spots are left it is live at once; after that, on to the NervixPay checkout. */
export function ListForm({ freeLeft, spots }: { freeLeft: number; spots: number }) {
  const free = freeLeft > 0
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setFail(null)
    const body = Object.fromEntries(new FormData(e.currentTarget))
    try {
      const r = await fetch('/api/listings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (r.status === 422) { setErrors(j.errors); return }
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      setErrors({})
      window.location.href = j.free ? j.page : j.pending
    } catch (err) { setFail((err as Error).message) } finally { setBusy(false) }
  }
  const bad = (n: string) => (errors[n] ? 'bad' : undefined)

  return (
    <main className="wrap page">
      <div className="eyebrow">Join Nervix Space</div>
      <h1>Bring your project into the space</h1>
      <p className="sub">{free
        ? <>Tell people what you built: an idea, an app demo, or a production-ready app for sale. The first {spots} projects join for free, and <b>{freeLeft} free spots are left</b>. Your page goes live as soon as you submit.</>
        : <>Tell people what you built: an idea, an app demo, or a production-ready app for sale. Your page goes live as soon as the 10 USD membership is paid in USDT or USDC through NervixPay.</>}</p>
      <form className="f" onSubmit={submit} noValidate>
        <Field name="name" label="Name" errors={errors}><input name="name" maxLength={60} className={bad('name')} required /></Field>
        <Field name="tagline" label="One line" hint="what it does, in under 90 characters" errors={errors}><input name="tagline" maxLength={90} className={bad('tagline')} required /></Field>
        <Field name="description" label="Description" hint="who it's for, what it does, what makes it good" errors={errors}><textarea name="description" maxLength={2000} className={bad('description')} required /></Field>
        <div className="two">
          <Field name="category" label="Category" errors={errors}>
            <select name="category" defaultValue="" className={bad('category')} required>
              <option value="" disabled>Choose…</option>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field name="offer" label="People can…" errors={errors}>
            <select name="offer" defaultValue="use" className={bad('offer')}>
              {OFFERS.map((o) => <option key={o.id} value={o.id}>{o.id === 'use' ? 'Use it' : o.id === 'sell' ? 'Buy the business' : 'Use it or buy it'}</option>)}
            </select>
          </Field>
        </div>
        <div className="two">
          <Field name="website" label="Website" hint="https://" errors={errors}><input name="website" type="url" placeholder="https://" className={bad('website')} required /></Field>
          <Field name="price" label="Price" hint="optional: '$19/month', 'Free', 'Asking $25k'" errors={errors}><input name="price" maxLength={60} className={bad('price')} /></Field>
        </div>
        <div className="two">
          <Field name="contact" label="Public contact" hint="email, Telegram or X handle" errors={errors}><input name="contact" maxLength={120} className={bad('contact')} required /></Field>
          <Field name="logo" label="Logo link" hint="optional, https:// image" errors={errors}><input name="logo" type="url" className={bad('logo')} /></Field>
        </div>
        <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
        <Field name="owner_email" label="Your email" hint={free ? 'so we can reach you, never shown' : 'for the receipt, never shown'} errors={errors}><input name="owner_email" type="email" className={bad('owner_email')} required /></Field>
        <div className="payline">
          {free
            ? <div><b>Free · founding spot</b><small>One of the first {spots} projects in Nervix Space: free, for good. {freeLeft} spots left.</small></div>
            : <div><b>10 USD membership</b><small>Paid in USDT or USDC with NervixPay, from your own wallet. Valid for one year.</small></div>}
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : free ? 'Join for free →' : 'Continue to payment →'}</button>
        </div>
        {fail && <span className="err">{fail}</span>}
      </form>
    </main>
  )
}
