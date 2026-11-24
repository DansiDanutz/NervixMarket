'use client'

import { useState } from 'react'
import { Avatar } from '@/components/avatar'
import { slugify } from '@/lib/listing'
import s from './home.module.css'

type Card = { name: string; tagline: string; logo: string; website: string }
type State = 'example' | 'loading' | 'filled' | 'error'

const EXAMPLE: Card = {
  name: 'Fake / Real', tagline: 'Paste a link, get REAL or FAKE with the sources.', logo: '', website: 'https://fake-real.live',
}

const isHttps = (u: string) => { try { return new URL(u).protocol === 'https:' } catch { return false } }
const hostOf = (u: string) => { try { return new URL(u).host } catch { return u } }

/** Paste a link and the listing card fills in, live. Calls the read-only /api/prefill; never publishes. */
export function PrefillDemo() {
  const [url, setUrl] = useState('')
  const [card, setCard] = useState<Card>(EXAMPLE)
  const [state, setState] = useState<State>('example')
  const [message, setMessage] = useState('This is an example. Paste your own link to see yours.')

  async function preview(e: React.FormEvent) {
    e.preventDefault()
    const link = url.trim()
    if (!isHttps(link)) { setState('error'); setMessage('Paste a full https:// link to your project.'); return }
    setState('loading'); setMessage('Reading your page…')
    try {
      const r = await fetch(`/api/prefill?url=${encodeURIComponent(link)}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'We could not read that page.')
      setCard({ name: j.name || hostOf(link), tagline: j.tagline || 'Add a one-line description.', logo: j.logo || '', website: link })
      setState('filled'); setMessage('Filled in from your page. Nothing is published until you continue.')
    } catch (err) {
      setState('error'); setMessage(`${(err as Error).message} You can still type the details yourself.`)
    }
  }

  const next = url.trim() ? `/list?website=${encodeURIComponent(url.trim())}` : '/list'
  return (
    <div className={s.demo}>
      <form onSubmit={preview} className={s.paste}>
        <label htmlFor="paste-url">Your project’s link</label>
        <div className={s.row}>
          <input id="paste-url" type="url" inputMode="url" placeholder="https://your-project.com" value={url}
            onChange={(e) => setUrl(e.target.value)} aria-describedby="paste-status" />
          <button type="submit" disabled={state === 'loading'}>{state === 'loading' ? 'Reading…' : 'Preview'}</button>
        </div>
      </form>
      <article className={s.preview} aria-live="polite" aria-busy={state === 'loading'}>
        <div className={s.previewHead}>
          <Avatar slug={slugify(card.name)} name={card.name} logo={card.logo || undefined} size={56} radius={14} />
          <div><h2>{card.name}</h2><p>{card.tagline}</p></div>
        </div>
        <div className={s.previewFoot}><span>{hostOf(card.website)}</span><span className={s.free}>Listed free</span></div>
      </article>
      <p id="paste-status" className={state === 'error' ? s.err : s.status}>{message}</p>
      <a className="btn" href={next}>Continue to list it free</a>
    </div>
  )
}
