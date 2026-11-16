import { ImageResponse } from 'next/og'
import { monogram } from '@/lib/monogram'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_TYPE = 'image/png'

const MAX_TITLE = 60
const MAX_LINE = 120
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** The planet mark, drawn with plain shapes (Satori supports a subset of SVG). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
      </defs>
      <circle cx="16" cy="16" r="8.5" fill="url(#p)" />
      <ellipse cx="16" cy="16" rx="14.5" ry="5.2" fill="none" stroke="#e8e6ff" strokeWidth="1.6" transform="rotate(-24 16 16)" />
      <circle cx="28.4" cy="10.6" r="2.1" fill="#e8e6ff" />
    </svg>
  )
}

/** One social card for every page: brand line, a big title, one supporting line, and an optional listing monogram. */
export function ogCard({ title, line, eyebrow, listing }: { title: string; line: string; eyebrow: string; listing?: { slug: string; name: string } }) {
  const m = listing ? monogram(listing.slug, listing.name) : null
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, color: '#eef0fb',
        backgroundColor: '#04050d',
        backgroundImage: 'radial-gradient(circle at 85% 0%, rgba(139,92,246,.45), rgba(4,5,13,0) 55%), radial-gradient(circle at 0% 100%, rgba(34,211,238,.18), rgba(4,5,13,0) 50%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 34, fontWeight: 700 }}>
          <Mark size={56} /> Nervix Space
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          {m && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 168, height: 168, flexShrink: 0, borderRadius: 40,
              fontSize: 68, fontWeight: 700, color: m.text, background: `linear-gradient(135deg, ${m.from}, ${m.to})` }}>{m.initials}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 24, letterSpacing: 4, textTransform: 'uppercase', color: '#22d3ee' }}>{eyebrow}</div>
            <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{clip(title, MAX_TITLE)}</div>
            <div style={{ fontSize: 32, color: '#a8aec8', lineHeight: 1.3 }}>{clip(line, MAX_LINE)}</div>
          </div>
        </div>
        <div style={{ fontSize: 26, color: '#a8aec8' }}>nervix.space · the AI Business Network from DansLab</div>
      </div>
    ),
    OG_SIZE,
  )
}
