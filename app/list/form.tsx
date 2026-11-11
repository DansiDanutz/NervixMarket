'use client'

import Link from 'next/link'
import { useState } from 'react'
import { FEATURE_USD } from '@/lib/listing'
import { EMPTY, Field, ListingFields, type Errors, type Values } from './fields'

type Done = { id: string; slug: string; page: string; manage: string; mailed: boolean }

/** Quick listing: paste the link, we fill in what we can, pick a category, add your email. Free, live at once. */
export function ListForm() {
  const [v, setV] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [filling, setFilling] = useState(false)
  const [filled, setFilled] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [fail, setFail] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }))

  async function autofill() {
    const url = v.website.trim()
    if (!/^https:\/\/\S+\.\S+/.test(url) || url === filled) return
    setFilling(true); setNote(null)
    try {
      const r = await fetch(`/api/prefill?url=${encodeURIComponent(url)}`)
      const j = await r.json()
      if (!r.ok) { setNote(`${j.error ?? 'Could not read that page.'} Fill in the fields below.`); return }
      setFilled(url)
      // only fill what the owner hasn't typed yet
      setV((p) => ({ ...p, name: p.name || j.name, tagline: p.tagline || j.tagline, description: p.description || j.description, logo: p.logo || j.logo }))
      setNote(j.name ? 'Filled in from your site. Check it, pick a category, and you are done.' : 'We could not find much on that page. Fill in the fields below.')
    } catch { setNote('Could not read that page. Fill in the fields below.') } finally { setFilling(false) }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setFail(null)
    const body = { ...v, company: (new FormData(e.currentTarget).get('company') as string) ?? '' }
    try {
      const r = await fetch('/api/listings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (r.status === 422) { setErrors(j.errors); return }
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      setErrors({}); setDone(j)
      window.scrollTo({ top: 0 })
    } catch (err) { setFail((err as Error).message) } finally { setBusy(false) }
  }

  if (done) return <Welcome d={done} />

  return (
    <main className="wrap page">
      <div className="eyebrow">Free for everyone</div>
      <h1>List your project in 30 seconds</h1>
      <p className="sub">Paste your link and we fill in the rest. An idea, an app demo or a production-ready app: listing is free, and your page goes live as soon as you submit. Want to sell it or charge a subscription? Add your NervixPay link.</p>
      <form className="f" onSubmit={submit} noValidate>
        <Field name="website" label="Your project's link" hint="we read the name, description and logo from it" errors={errors}>
          <div className="urlrow">
            <input name="website" type="url" placeholder="https://" value={v.website} className={errors.website ? 'bad' : undefined}
              onChange={(e) => set('website', e.target.value)} onBlur={autofill} required autoFocus />
            <button type="button" className="btn ghost" onClick={autofill} disabled={filling}>{filling ? 'Reading…' : 'Autofill'}</button>
          </div>
        </Field>
        {note && <p className="note">{note}</p>}
        <ListingFields v={v} set={set} errors={errors} withEmail />
        <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
        <div className="payline">
          <div><b>Free</b><small>Listing is free, for good. You get a private link to edit, pause or delete it.</small></div>
          <button className="btn" disabled={busy}>{busy ? 'Publishing…' : 'Publish my listing →'}</button>
        </div>
        {fail && <span className="err">{fail}</span>}
      </form>
    </main>
  )
}

function Welcome({ d }: { d: Done }) {
  const [copied, setCopied] = useState(false)
  return (
    <main className="wrap page">
      <div className="eyebrow">You’re in the space</div>
      <h1>Your project is live.</h1>
      <div className="box">
        <p><span className="status live">LIVE</span></p>
        <p><b>Save your private manage link.</b> It is the only way to edit, pause or delete your listing{d.mailed ? ' (we also emailed it to you)' : ''}. Anyone with it can change your listing, so keep it to yourself.</p>
        <div className="urlrow">
          <input readOnly value={d.manage} onFocus={(e) => e.currentTarget.select()} aria-label="Your manage link" />
          <button type="button" className="btn ghost" onClick={() => { navigator.clipboard?.writeText(d.manage).then(() => setCopied(true)) }}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <Link className="btn" href={d.page}>See your page →</Link>
          <Link className="btn ghost" href={`/feature/${d.id}`}>Feature it · {FEATURE_USD} USD</Link>
        </div>
      </div>
    </main>
  )
}
