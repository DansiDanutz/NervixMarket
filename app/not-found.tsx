import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Not found · Nervix Space', robots: { index: false } }

/** Shown for unknown pages and for listings that are paused, hidden or removed. */
export default function NotFound() {
  return (
    <main className="wrap page">
      <div className="eyebrow">404 · Lost in space</div>
      <h1>This page isn’t in the space</h1>
      <p className="sub">The link may be wrong, or the owner paused or removed this listing.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn" href="/#directory">Explore the directory</Link>
        <Link className="btn ghost" href="/list">List your project free</Link>
      </div>
    </main>
  )
}
