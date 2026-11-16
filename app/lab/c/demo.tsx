'use client'

import { useState } from 'react'
import { slugify } from '@/lib/listing'
import { Avatar } from '../avatar'
import s from './c.module.css'

type Card = { name: string; tagline: string; logo: string; website: string }

const EXAMPLE: Card = {
  name: 'Fake / Real', tagline: 'Paste a link, get REAL or FAKE with the sources.', logo: '', website: 'https://fake-real.live',
}

const isHttps = (u: string) => { try { return new URL(u).protocol === 'https:' } catch { return false } }
const hostOf = (u: string) => { try { return new URL(u).host } catch { return u } }

/** Paste a link → the listing card fills in, live. Calls the existing read-only /api/prefill; never publishes. */
export function PrefillDemo() {
  const [url, setUrl] = useState('')
  const [card, setCard] = useState<Card>(EXAMPLE)
  const [state, setState] = useState<'example' | 'loading' | 'filled' | 'error'>('example')
  const [message, setMessage] = useState('Example listing. Paste your own link to see yours.')

  async function preview(e: React.FormEvent) {
    e.preventDefault()
    const link = url.trim()
    if (!isHttps(link)) { setState('error'); setMessage('Paste a full https:// link to your project.'); return }
    setState('loading'); setMessage('Reading your page…')
    try {
      const r = await fetch(`/api/prefill?url=${encodeURIComponent(link)}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Could not read that page.')
      setCard({ name: j.name || hostOf(link), tagline: j.tagline || 'Add a one-line description.', logo: j.logo || '', website: link })
      setState('filled'); setMessage('Filled in from your page. Nothing is published until you continue.')
    } catch (err) {
      setState('error'); setMessage(`${(err as Error).message} You can still type the details yourself.`)
    }
  }

  return (
    <div className={s.demo}>
      <form onSubmit={preview} className={s.paste}>
        <label htmlFor="c-url">Your project’s link</label>
        <div>
          <input id="c-url" type="url" inputMode="url" placeholder="https://your-project.com" value={url}
            onChange={(e) => setUrl(e.target.value)} aria-describedby="c-status" />
          <button type="submit" disabled={state === 'loading'}>{state === 'loading' ? 'Reading…' : 'Preview'}</button>
        </div>
      </form>
      <article className={s.card} aria-live="polite" aria-busy={state === 'loading'}>
        <div className={s.cardHead}>
          <Avatar slug={slugify(card.name)} name={card.name} logo={card.logo} size={56} radius={14} />
          <div><h3>{card.name}</h3><p>{card.tagline}</p></div>
        </div>
        <div className={s.cardFoot}><span>{hostOf(card.website)}</span><span className={s.free}>Listed free</span></div>
      </article>
      <p id="c-status" className={state === 'error' ? s.err : s.status}>{message}</p>
      <a className={s.primary} href={`/list${url ? `?website=${encodeURIComponent(url.trim())}` : ''}`}>Continue to list it free →</a>
    </div>
  )
}
