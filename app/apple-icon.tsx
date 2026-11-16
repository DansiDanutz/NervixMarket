import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/** Home-screen icon: the planet mark on the site's night background. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#04050d' }}>
        <svg width="140" height="140" viewBox="0 0 32 32">
          <defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
          <circle cx="16" cy="16" r="8.5" fill="url(#p)" />
          <ellipse cx="16" cy="16" rx="14.5" ry="5.2" fill="none" stroke="#e8e6ff" strokeWidth="1.6" transform="rotate(-24 16 16)" />
          <circle cx="28.4" cy="10.6" r="2.1" fill="#e8e6ff" />
        </svg>
      </div>
    ),
    size,
  )
}
