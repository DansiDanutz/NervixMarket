import { monogram } from '@/lib/monogram'

/** The listing's logo, or a generated monogram that is distinct per listing. Fixed size: no layout shift. */
export function Avatar({ slug, name, logo, size = 48, radius = 12 }: { slug: string; name: string; logo?: string; size?: number; radius?: number }) {
  const box = { width: size, height: size, borderRadius: radius, flex: 'none' as const }
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element -- remote owner logos; unoptimized by design
    return <img src={logo} alt="" width={size} height={size} referrerPolicy="no-referrer" loading="lazy" style={{ ...box, objectFit: 'cover' }} />
  }
  const m = monogram(slug, name)
  return (
    <span aria-hidden="true" style={{
      ...box, display: 'grid', placeItems: 'center', color: m.text, fontWeight: 700, letterSpacing: '-.02em',
      fontSize: Math.round(size * 0.38), background: `linear-gradient(135deg, ${m.from}, ${m.to})`,
    }}>{m.initials}</span>
  )
}
