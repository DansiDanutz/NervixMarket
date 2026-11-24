import { monogram } from '@/lib/monogram'
import { LogoImage } from './logo-image'

/** The listing's logo, or a generated monogram that is distinct per listing. Fixed size: no layout shift. */
export function Avatar({ slug, name, logo, size = 48, radius = 12 }: { slug: string; name: string; logo?: string; size?: number; radius?: number }) {
  const m = monogram(slug, name)
  const fallback = (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: radius, flex: 'none', display: 'grid', placeItems: 'center',
      color: m.text, fontWeight: 700, letterSpacing: '-.02em', fontSize: Math.round(size * 0.38),
      background: `linear-gradient(135deg, ${m.from}, ${m.to})`,
    }}>{m.initials}</span>
  )
  if (logo) {
    return <LogoImage src={logo} size={size} radius={radius} fallback={fallback} />
  }
  return fallback
}
