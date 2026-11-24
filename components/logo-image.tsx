'use client'

import { useState } from 'react'

/** Renders a remote listing logo and falls back to the deterministic monogram if the image fails to load. */
export function LogoImage({
  src,
  size,
  radius,
  fallback,
}: {
  src: string
  size: number
  radius: number
  fallback: React.ReactNode
}) {
  const [broken, setBroken] = useState(false)
  if (broken) return <>{fallback}</>
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote owner logos; unoptimized by design
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setBroken(true)}
      style={{ width: size, height: size, borderRadius: radius, flex: 'none', objectFit: 'cover' }}
    />
  )
}
