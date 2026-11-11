'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { FEATURE_USD } from '@/lib/listing'
import { EMPTY, ListingFields, type Errors, type Values } from '@/app/list/fields'

type State = { status: string; slug: string; name: string; featured: boolean; featured_until: string | null; owner_email: string }

/** The owner's page. The manage token lives in the URL fragment (#…), so it never reaches a server log;
 *  it is sent to the API in a header. */
export function Manage({ id }: { id: string }) {
  const [token, setToken] = useState<string | null>(null)
  const [v, setV] = useState<Values>(EMPTY)
  const [st, setSt] = useState<State | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [fail, setFail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }))

  const load = (j: Record<string, unknown>) => {
    const s = (k: string) => (typeof j[k] === 'string' ? (j[k] as string) : '')
    setV({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, s(k)])), pay_mode: s('pay_mode') || 'buy' })
    setSt({ status: s('status'), slug: s('slug'), name: s('name'), featured: !!j.featured, featured_until: (j.featured_until as string) ?? null, owner_email: s('owner_email') })
  }

  useEffect(() => {
    // a different manage link pasted into the same tab only changes the #fragment: start over
    const again = () => window.location.reload()
    window.addEventListener('hashchange', again)
    return () => window.removeEventListener('hashchange', again)
  }, [])

  useEffect(() => {
    const t = window.location.hash.slice(1)
    setToken(t)
    if (!t) { setFail('This page needs your private manage link (the one you got when you listed).'); return }
    fetch(`/api/listings/${id}`, { headers: { 'x-manage-token': t }, cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok || !j.owner) throw new Error(r.status === 404 ? 'This listing does not exist anymore.' : 'This manage link is not valid. Ask for a new one below.')
        load(j)
      })
      .catch((e) => setFail(e.message))
  }, [id])

  async function call(method: 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(true); setMsg(null); setFail(null)
    try {
      const r = await fetch(`/api/listings/${id}`, { method, headers: { 'x-manage-token': token ?? '', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const j = await r.json()
      if (r.status === 422) { setErrors(j.errors ?? {}); return null }
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      setErrors({})
      return j
    } catch (e) { setFail((e as Error).message); return null } finally { setBusy(false) }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const { owner_email: _, ...fields } = v
    const j = await call('PATCH', fields)
    if (j) { load(j); setMsg('Saved. Your page is up to date.') }
  }
  async function toggle() {
    const j = await call('PATCH', { status: st?.status === 'paused' ? 'active' : 'paused' })
    if (j) { load(j); setMsg(j.status === 'paused' ? 'Paused: your listing is hidden until you resume it.' : 'Your listing is live again.') }
  }
  async function remove() {
    if (!confirm('Delete this listing for good? This cannot be undone.')) return
    const j = await call('DELETE')
    if (j) { setSt(null); setMsg(null); setFail('Your listing was deleted.') }
  }

  if (!st) {
    return (
      <main className="wrap page">
        <div className="eyebrow">Manage your listing</div>
        <h1>{fail ? 'Hmm.' : 'Loading…'}</h1>
        {fail && <div className="box"><p>{fail}</p><Recover /></div>}
      </main>
    )
  }

  const live = st.status === 'active'
  return (
    <main className="wrap page">
      <div className="eyebrow">Manage your listing</div>
      <h1>{st.name}</h1>
      <div className="box" style={{ marginBottom: 22 }}>
        <p><span className={`status ${live ? 'live' : ''}`}>{live ? 'LIVE' : st.status === 'paused' ? 'PAUSED' : 'UNDER REVIEW'}</span>
          {st.featured && st.featured_until && <span className="pill founding" style={{ marginLeft: 8 }}>Featured until {new Date(st.featured_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}</p>
        {st.status === 'hidden' && <p>Your listing was reported by several people and is hidden until the team reviews it.</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {live && <Link className="btn ghost" href={`/l/${st.slug}`}>See your page</Link>}
          {st.status !== 'hidden' && <button className="btn ghost" onClick={toggle} disabled={busy}>{st.status === 'paused' ? 'Resume' : 'Pause'}</button>}
          <Link className="btn ghost" href={`/feature/${id}`}>{st.featured ? 'Extend Featured' : `Feature it · ${FEATURE_USD} USD`}</Link>
          <button className="btn ghost danger" onClick={remove} disabled={busy}>Delete</button>
        </div>
      </div>
      <form className="f" onSubmit={save} noValidate>
        <label>Website<input name="website" type="url" value={v.website} className={errors.website ? 'bad' : undefined} onChange={(e) => set('website', e.target.value)} />{errors.website && <span className="err">{errors.website}</span>}</label>
        <ListingFields v={v} set={set} errors={errors} withEmail={false} />
        <div className="payline">
          <div><b>Save changes</b><small>Owner email: {st.owner_email}</small></div>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save →'}</button>
        </div>
        {msg && <p className="note">{msg}</p>}
        {fail && <span className="err">{fail}</span>}
      </form>
    </main>
  )
}

function Recover() {
  const [email, setEmail] = useState('')
  const [out, setOut] = useState<string | null>(null)
  async function go(e: React.FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/manage/recover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const j = await r.json().catch(() => ({}))
    setOut(j.message ?? j.error ?? 'Something went wrong.')
  }
  return (
    <form className="f" onSubmit={go} style={{ marginTop: 14 }}>
      <label>Lost your link? <span className="h">we email a new one to the address you listed with</span>
        <div className="urlrow"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /><button className="btn ghost">Send</button></div>
      </label>
      {out && <p className="note">{out}</p>}
    </form>
  )
}
