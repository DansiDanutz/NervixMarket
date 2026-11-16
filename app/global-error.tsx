'use client'

import './globals.css'

/** Last resort when the root layout itself fails: it replaces the layout, so it brings its own <html lang>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="wrap page">
          <div className="eyebrow">Nervix Space</div>
          <h1>Something went wrong</h1>
          <p className="sub">The page couldn’t load. Try again in a moment.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={reset}>Try again</button>
            <a className="btn ghost" href="/">Go to the home page</a>
          </div>
          {error.digest && <p className="h" style={{ marginTop: 18 }}>Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  )
}
