'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BadgeEmbed } from '@/components/badge-embed'
import { GenesisBar } from '@/components/genesis-bar'
import { FEATURE_USD } from '@/lib/listing'
import type { GenesisStatus } from '@/lib/store'
import { EMPTY, Field, ListingFields, type Errors, type Values } from './fields'
import s from './list.module.css'
import { HTTPS_URL, progress } from './progress'

type Done = {
  id: string
  slug: string
  status: string
  genesis_number?: number | null
  page: string
  manage: string
  pay_to_publish?: string
  checkout_url?: string | null
  listing_usd?: number
  mailed: boolean
}

const MAX_URL = 300

const STEPS = ['Paste your link', 'Check the details', 'Publish'] as const

function Stepper({ at }: { at: 1 | 2 | 3 }) {
  return (
    <ol className={s.stepper} aria-label="Progress">
      {STEPS.map((label, i) => {
        const n = i + 1
        const state = n < at ? 'done' : n === at ? 'now' : 'next'
        return (
          <li key={label} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
            <span aria-hidden="true">{state === 'done' ? '✓' : n}</span>{label}
            {state === 'done' && <span className="sr"> (done)</span>}
          </li>
        )
      })}
    </ol>
  )
}

/** Quick listing: paste the link, we fill in what we can, pick a category, add your email.
 *  Free forever for the first 200 Genesis projects; one-time NervixPay listing fee after 200. */
export function ListForm({ genesis }: { genesis: GenesisStatus }) {
  const [v, setV] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [filling, setFilling] = useState(false)
  const [filled, setFilled] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [fail, setFail] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }))

  // Arriving from the home page's paste demo: /list?website=https://…
  useEffect(() => {
    const website = new URLSearchParams(window.location.search).get('website')?.trim().slice(0, MAX_URL)
    if (website && HTTPS_URL.test(website)) { setV((p) => ({ ...p, website })); void autofill(website) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [])

  async function autofill(fromUrl?: string) {
    const url = (fromUrl ?? v.website).trim()
    if (!HTTPS_URL.test(url) || url === filled) return
    setFilling(true); setNote(null)
    try {
      const r = await fetch(`/api/prefill?url=${encodeURIComponent(url)}`)
      const j = await r.json().catch(() => ({}))
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
      const j = await r.json().catch(() => ({}))
      if (r.status === 422 && j.errors) {
        setErrors(j.errors)
        const firstBad = Object.keys(j.errors)[0]
        if (firstBad) {
          const el = formRef.current?.querySelector<HTMLElement>(`[name="${CSS.escape(firstBad)}"]`)
          el?.focus()
        }
        return
      }
      if (!r.ok) throw new Error(j.error ?? `Could not publish right now (HTTP ${r.status}).`)
      setErrors({}); setDone(j)
      window.scrollTo({ top: 0 })
    } catch (err) { setFail((err as Error).message) } finally { setBusy(false) }
  }

  if (done) return <Welcome d={done} name={v.name.trim() || done.slug} cap={genesis.cap} />

  return (
    <main className="wrap page">
      <div className="eyebrow">{genesis.free_open ? `Genesis ${genesis.cap} · Free forever` : `Standard listing · ${genesis.listing_usd} USD one-time`}</div>
      <h1>List your project in 30 seconds</h1>
      <p className="sub">
        {genesis.free_open
          ? `Paste your link and we fill in the rest. The first ${genesis.cap} projects list free forever with a permanent Genesis badge — your page goes live immediately.`
          : `Paste your link and we fill in the rest. All ${genesis.cap} free Genesis spots are claimed; publish permanently for ${genesis.listing_usd} USD one-time in USDT or USDC via NervixPay.`}
      </p>
      <div className="genesis-list-wrap">
        <GenesisBar genesis={genesis} />
      </div>
      <Stepper at={progress(v)} />
      <form ref={formRef} className="f" onSubmit={submit} noValidate>
        <Field name="website" label="Your project's link" hint="we read the name, description and logo from it" errors={errors}>
          <div className="urlrow">
            <input name="website" type="url" placeholder="https://" value={v.website} className={errors.website ? 'bad' : undefined}
              onChange={(e) => set('website', e.target.value)} onBlur={() => autofill()} required autoFocus />
            <button type="button" className="btn ghost" onClick={() => autofill()} disabled={filling}>{filling ? 'Reading…' : 'Autofill'}</button>
          </div>
        </Field>
        {note && <p className="note" role="status" aria-live="polite">{note}</p>}
        <ListingFields v={v} set={set} errors={errors} withEmail />
        <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="honeypot" />
        <div className="payline">
          {genesis.free_open ? (
            <div>
              <b>Free · Genesis {genesis.cap}</b>
              <small>{genesis.remaining} of {genesis.cap} free spots left. Live immediately with a private manage link.</small>
            </div>
          ) : (
            <div>
              <b>{genesis.listing_usd} USD one-time</b>
              <small>Paid in USDT or USDC via NervixPay on the next step. 0% cut on your sales forever.</small>
            </div>
          )}
          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : genesis.free_open ? 'Claim free spot' : `Continue · ${genesis.listing_usd} USD →`}
          </button>
        </div>
        {fail && <p className="err" role="alert">{fail}</p>}
      </form>
    </main>
  )
}

function Welcome({ d, name, cap }: { d: Done; name: string; cap: number }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const origin = (() => {
    try { return new URL(d.manage).origin } catch { return 'https://nervix.space' }
  })()
  async function copyLink() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(d.manage)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }
  const isPending = d.status === 'pending'
  return (
    <main className="wrap page">
      <div className="eyebrow">{isPending ? 'One step left' : 'You’re in the space'}</div>
      <h1>{isPending ? 'Your listing is saved.' : 'Your project is live.'}</h1>
      <div className="box">
        <p className="manage-pills">
          <span className={`status ${isPending ? '' : 'live'}`}>{isPending ? 'WAITING FOR PAYMENT' : 'LIVE'}</span>
          {typeof d.genesis_number === 'number' && (
            <span className="pill genesis">Genesis #{d.genesis_number} of {cap}</span>
          )}
        </p>
        {isPending && (
          <p>
            Complete your one-time <b>{d.listing_usd ?? 19} USD</b> NervixPay payment to publish <b>{name}</b> permanently.
          </p>
        )}
        <p><b>Save your private manage link.</b> It is the only way to edit, pause or delete your listing{d.mailed ? ' (we also emailed it to you)' : ''}. Anyone with it can change your listing, so keep it to yourself.</p>
        <div className="urlrow">
          <input readOnly value={d.manage} onFocus={(e) => e.currentTarget.select()} aria-label="Your manage link" />
          <button type="button" className="btn ghost" onClick={copyLink}>{copyState === 'copied' ? 'Copied' : 'Copy'}</button>
        </div>
        {copyState === 'failed' && <p className="note" role="status">Select the link above and copy it manually.</p>}
        <div className={s.welcomeActions}>
          {isPending ? (
            <>
              <Link className="btn" href={d.pay_to_publish ?? `/pending/${d.id}`}>Pay {d.listing_usd ?? 19} USD &amp; publish →</Link>
              <a className="btn ghost" href={d.manage}>Open manage page</a>
            </>
          ) : (
            <>
              <Link className="btn" href={d.page}>See your page</Link>
              <a className="btn ghost" href={d.manage}>Open manage page</a>
              <Link className="btn ghost" href={`/feature/${d.id}`}>Feature it · {FEATURE_USD} USD</Link>
            </>
          )}
        </div>
      </div>
      {!isPending && <BadgeEmbed slug={d.slug} name={name} baseUrl={origin} defaultOpen />}
    </main>
  )
}
