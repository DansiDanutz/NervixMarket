'use client'

import { useEffect } from 'react'
import { MODE_COOKIE, type Mode } from '@/lib/mode'

const ONE_YEAR = 60 * 60 * 24 * 365

/** Remembers the visitor's last explicit choice so a bare visit to "/" opens the same way. Renders nothing. */
export function RememberMode({ mode }: { mode: Mode }) {
  useEffect(() => {
    document.cookie = `${MODE_COOKIE}=${mode}; path=/; max-age=${ONE_YEAR}; samesite=lax`
  }, [mode])
  return null
}
