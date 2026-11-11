'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Re-checks every 5 s; reloads the page once the listing is featured. */
export function Poll({ id }: { id: string }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/listings/${id}`, { cache: 'no-store' })
        if (r.ok && (await r.json()).featured) { clearInterval(t); router.refresh() }
      } catch { /* offline: try again */ }
    }, 5000)
    return () => clearInterval(t)
  }, [id, router])
  return <p className="h" style={{ color: 'var(--muted)', fontSize: 13 }}>This page updates by itself when the payment is confirmed.</p>
}
