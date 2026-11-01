/** The Nervix Space mark: a planet with its orbit and a moon. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="ns-p" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="8.5" fill="url(#ns-p)" />
      <ellipse cx="16" cy="16" rx="14.5" ry="5.2" fill="none" stroke="#e8e6ff" strokeOpacity=".85" strokeWidth="1.6" transform="rotate(-24 16 16)" />
      <circle cx="28.4" cy="10.6" r="2.1" fill="#fff" />
    </svg>
  )
}
