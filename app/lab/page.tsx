import Link from 'next/link'

const OPTIONS = [
  { href: '/lab/a', name: 'A · Mission Control', line: 'The current space identity, calmer: static stars, an instrument-panel directory, mono data labels.' },
  { href: '/lab/b', name: 'B · Gallery', line: 'Editorial and light-first: big type, listings as magazine tiles, space reduced to the mark.' },
  { href: '/lab/c', name: 'C · Live Network', line: 'The hero is the product: paste a link and watch the listing card fill in. Minimal decoration.' },
]

export default function LabIndex() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 20px', color: '#eef0fb', font: '16px/1.6 system-ui, sans-serif' }}>
      <p style={{ font: '600 13px ui-monospace, monospace', letterSpacing: '.12em', color: '#7dd3fc', margin: 0 }}>NERVIX SPACE · DESIGN LAB · PREVIEW ONLY</p>
      <h1 style={{ fontSize: 40, lineHeight: 1.1, margin: '12px 0 8px' }}>Three directions</h1>
      <p style={{ color: '#b4b9d4', margin: '0 0 32px' }}>Mocks for checkpoint 2. They use the six live public listings and only the product claims already on the site. Nothing here writes data.</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
        {OPTIONS.map((o) => (
          <li key={o.href}>
            <Link href={o.href} style={{ display: 'block', padding: '18px 20px', borderRadius: 14, border: '1px solid rgba(190,200,255,.18)', color: 'inherit', textDecoration: 'none' }}>
              <b style={{ fontSize: 20 }}>{o.name} →</b>
              <span style={{ display: 'block', color: '#b4b9d4' }}>{o.line}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
