'use client'

import Link from 'next/link'

/** Shown inside the site layout when a page fails to render. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="wrap page">
      <div className="eyebrow">Something went wrong</div>
      <h1>This page didn’t load</h1>
      <p className="sub">It’s on our side, not yours. Try again, or head back to the directory.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" type="button" onClick={reset}>Try again</button>
        <Link className="btn ghost" href="/#directory">Explore the directory</Link>
      </div>
      {error.digest && <p className="h" style={{ marginTop: 18 }}>Reference: {error.digest}</p>}
    </main>
  )
}
