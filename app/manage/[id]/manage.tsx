'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { badgeSnippets } from '@/lib/badge'
import { FEATURE_USD } from '@/lib/listing'
import type { ListingMetrics } from '@/lib/store'
import { CopySnippet } from '@/components/copy-snippet'
import { EMPTY, ListingFields, type Errors, type Values } from '@/app/list/fields'

type State = {
  status: string
  slug: string
  name: string
  website: string
  featured: boolean
  featured_until: string | null
  verified: boolean
  verified_at: string | null
  owner_email: string
  metrics: ListingMetrics | null
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/** The owner's page. The manage token lives in the URL fragment (#…), so it never reaches a server log;
 *  it is sent to the API in a header. */
export function Manage({ id }: { id: string }) {
  const [token, setToken] = useState<string | null>(null)
  const [v, setV] = useState<Values>(EMPTY)
  const [st, setSt] = useState<State | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [fail, setFail] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyNote, setVerifyNote] = useState<{ ok: boolean; text: string } | null>(null)
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }))

  const load = (j: Record<string, unknown>) => {
    const s = (k: string) => (typeof j[k] === 'string' ? (j[k] as string) : '')
    setV({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, s(k)])), pay_mode: s('pay_mode') || 'buy' })
    setSt({
      status: s('status'),
      slug: s('slug'),
      name: s('name'),
      website: s('website'),
      featured: !!j.featured,
      featured_until: (j.featured_until as string) ?? null,
      verified: !!j.verified,
      verified_at: (j.verified_at as string) ?? null,
      owner_email: s('owner_email'),
      metrics: (j.metrics as ListingMetrics | undefined) ?? null,
    })
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
        const j = await r.json().catch(() => ({}))
        if (!r.ok || !j.owner) {
          throw new Error(r.status === 404 ? 'This listing does not exist anymore.' : 'This manage link is not valid. Ask for a new one below.')
        }
        load(j)
      })
      .catch((e) => setFail(e.message || 'Could not load your listing right now.'))
  }, [id])

  async function call(method: 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(true); setMsg(null); setFail(null)
    try {
      const r = await fetch(`/api/listings/${id}`, {
        method,
        headers: { 'x-manage-token': token ?? '', 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const j = await r.json().catch(() => ({}))
      if (r.status === 422) { setErrors(j.errors ?? {}); return null }
      if (!r.ok) throw new Error(j.error ?? `Request failed (HTTP ${r.status}).`)
      setErrors({})
      return j
    } catch (e) { setFail((e as Error).message); return null } finally { setBusy(false) }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const { owner_email: _, ...fields } = v
    const j = await call('PATCH', fields)
    if (j) { load(j); setVerifyNote(null); setMsg('Saved. Your page is up to date.') }
  }
  async function toggle() {
    const j = await call('PATCH', { status: st?.status === 'paused' ? 'active' : 'paused' })
    if (j) { load(j); setMsg(j.status === 'paused' ? 'Paused: your listing is hidden until you resume it.' : 'Your listing is live again.') }
  }
  async function remove() {
    const j = await call('DELETE')
    if (j) { setSt(null); setMsg(null); setConfirmDelete(false); setDeleted(true); setFail('Your listing was deleted.') }
  }

  async function verifySite() {
    setVerifying(true); setVerifyNote(null)
    try {
      const r = await fetch(`/api/listings/${id}/verify`, {
        method: 'POST',
        headers: { 'x-manage-token': token ?? '' },
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setVerifyNote({ ok: false, text: j.error ?? `Verification check failed (HTTP ${r.status}).` })
        return
      }
      if (j.verified) {
        setSt((prev) => prev ? { ...prev, verified: true, verified_at: j.verified_at ?? new Date().toISOString() } : prev)
        const via = j.method === 'badge' ? 'your Nervix Space badge' : j.method === 'backlink' ? 'a link to your listing' : 'your nervix-verify meta tag'
        setVerifyNote({ ok: true, text: `Site verified via ${via}. Your Verified badge is now live.` })
      } else {
        setVerifyNote({ ok: false, text: j.reason ?? 'Could not verify your site yet. Paste the badge or meta tag on your homepage and try again.' })
      }
    } catch {
      setVerifyNote({ ok: false, text: 'Could not reach the server. Please try again shortly.' })
    } finally {
      setVerifying(false)
    }
  }

  if (!st) {
    return (
      <main className="wrap page">
        <div className="eyebrow">Manage your listing</div>
        <h1>{deleted ? 'Listing deleted' : fail ? 'Manage link needed' : 'Loading…'}</h1>
        {fail && (
          <div className="box">
            <p role={deleted ? 'status' : 'alert'}>{fail}</p>
            {deleted ? <div className="row-actions"><Link className="btn" href="/#directory">Explore the directory</Link><Link className="btn ghost" href="/list">List another project</Link></div> : <Recover />}
          </div>
        )}
      </main>
    )
  }

  const live = st.status === 'active'
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nervix.space'
  const snippets = badgeSnippets(st.slug, st.name, origin)
  const metaSnippet = `<meta name="nervix-verify" content="${id}" />`
  const m = st.metrics
  const totalActivity = m
    ? m.totals.views + m.totals.visit_clicks + m.totals.pay_clicks + m.totals.mcp_lookups + m.totals.badge_loads
    : 0
  const metricCards = m
    ? [
        { label: 'Page views', recent: m.recent.views, total: m.totals.views, hint: 'Humans opening /l/' + st.slug },
        { label: 'Site clicks', recent: m.recent.visit_clicks, total: m.totals.visit_clicks, hint: 'Clicks on Visit' },
        { label: 'Pay clicks', recent: m.recent.pay_clicks, total: m.totals.pay_clicks, hint: 'Clicks to NervixPay' },
        { label: 'AI agent lookups', recent: m.recent.mcp_lookups, total: m.totals.mcp_lookups, hint: 'MCP get_listing calls' },
        { label: 'Badge loads', recent: m.recent.badge_loads, total: m.totals.badge_loads, hint: 'SVG badge impressions' },
      ]
    : []

  return (
    <main className="wrap page">
      <div className="eyebrow">Manage your listing</div>
      <h1>{st.name}</h1>
      <div className="box manage-box">
        <p className="manage-pills">
          <span className={`status ${live ? 'live' : ''}`}>{live ? 'LIVE' : st.status === 'paused' ? 'PAUSED' : 'UNDER REVIEW'}</span>
          {st.verified && <span className="pill verified pill-gap">Verified site</span>}
          {st.featured && st.featured_until && (
            <span className="pill founding pill-gap">
              Featured until {fmtDate(st.featured_until)}
            </span>
          )}
        </p>
        {st.status === 'hidden' && <p>Your listing was reported by several people and is hidden until the team reviews it.</p>}
        <div className="row-actions">
          {live && <Link className="btn ghost" href={`/l/${st.slug}`}>See your page</Link>}
          {st.status !== 'hidden' && <button type="button" className="btn ghost" onClick={toggle} disabled={busy}>{st.status === 'paused' ? 'Resume' : 'Pause'}</button>}
          <Link className="btn ghost" href={`/feature/${id}`}>{st.featured ? 'Extend Featured' : `Feature it · ${FEATURE_USD} USD`}</Link>
          {confirmDelete ? (
            <span className="confirm-row" role="group" aria-label="Confirm deletion">
              <button type="button" className="btn ghost danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Confirm delete'}</button>
              <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="btn ghost danger" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete</button>
          )}
        </div>
      </div>

      {m && (
        <section className="box stats-panel" aria-labelledby="reach-heading">
          <div className="panel-head">
            <div>
              <h2 id="reach-heading">Listing reach</h2>
              <p className="h">Last {m.window_days} days (with all-time total). Aggregated server counts · no cookies or trackers.</p>
            </div>
          </div>
          <div className="stat-grid">
            {metricCards.map((c) => (
              <div className="stat-card" key={c.label}>
                <span className="stat-label">{c.label}</span>
                <b className="stat-num">{c.recent.toLocaleString('en-US')}</b>
                <span className="stat-sub">{c.total.toLocaleString('en-US')} all time · {c.hint}</span>
              </div>
            ))}
          </div>
          {totalActivity === 0 && (
            <p className="h stats-empty">No traffic recorded yet — embed your badge below or share <code>/l/{st.slug}</code> to start seeing visits and AI agent lookups here.</p>
          )}
        </section>
      )}

      <section className="box verify-box" aria-labelledby="verify-heading">
        <div className="panel-head">
          <div>
            <h2 id="verify-heading">Site verification &amp; badge</h2>
            {st.verified && st.verified_at ? (
              <p className="h">
                Verified on {fmtDate(st.verified_at)}. Shown on your directory card, listing page, SVG badge, and MCP agent responses.
              </p>
            ) : (
              <p className="h">
                Prove you own <code>{st.website.replace(/^https:\/\//, '').replace(/\/$/, '')}</code> to earn a <b>Verified</b> badge on the directory, SVG badge, and AI agent responses.
              </p>
            )}
          </div>
          <button type="button" className="btn ghost" onClick={verifySite} disabled={verifying || busy}>
            {verifying ? 'Checking site…' : st.verified ? 'Re-verify site' : 'Verify my site'}
          </button>
        </div>

        {verifyNote && (
          <p className={verifyNote.ok ? 'note verify-msg' : 'err verify-msg'} role={verifyNote.ok ? 'status' : 'alert'}>
            {verifyNote.text}
          </p>
        )}

        <details className="more verify-steps" open={!st.verified || undefined}>
          <summary>
            {st.verified ? 'Your embeddable Verified badge snippets' : 'How to verify (pick either option, then click Verify my site)'}
          </summary>
          <div className="badge-body">
            <div className="badge-preview">
              {/* eslint-disable-next-line @next/next/no-img-element -- local dynamic SVG badge */}
              <img
                src={`/api/badge/${encodeURIComponent(st.slug)}?v=${st.verified ? '1' : '0'}`}
                alt={`${st.name} on Nervix Space`}
                height={28}
              />
            </div>
            <CopySnippet label="Option 1: Paste this HTML badge on your homepage" code={snippets.html} inline />
            <CopySnippet label="Option 2: Or paste this meta tag inside <head>" code={metaSnippet} inline />
            <CopySnippet label="Markdown (for GitHub README)" code={snippets.markdown} inline />
          </div>
        </details>
      </section>

      <form className="f" onSubmit={save} noValidate>
        <label>Website<input name="website" type="url" value={v.website} className={errors.website ? 'bad' : undefined} onChange={(e) => set('website', e.target.value)} />{errors.website && <span className="err">{errors.website}</span>}</label>
        <ListingFields v={v} set={set} errors={errors} withEmail={false} />
        <div className="payline">
          <div><b>Save changes</b><small>Owner email: {st.owner_email}</small></div>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save →'}</button>
        </div>
        {msg && <p className="note" role="status">{msg}</p>}
        {fail && <p className="err" role="alert">{fail}</p>}
      </form>
    </main>
  )
}

function Recover() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<string | null>(null)
  async function go(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setOut(null)
    try {
      const r = await fetch('/api/manage/recover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const j = await r.json().catch(() => ({}))
      setOut(j.message ?? j.error ?? 'Something went wrong.')
    } catch {
      setOut('Could not reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="f recover-form" onSubmit={go}>
      <label>Lost your link? <span className="h">we email a new one to the address you listed with</span>
        <div className="urlrow">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          <button className="btn ghost" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </label>
      {out && <p className="note" role="status">{out}</p>}
    </form>
  )
}
