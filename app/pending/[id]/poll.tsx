'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

const POLL_INTERVAL_MS = 5_000
const MAX_CHECKS = 180 // 15 minutes of active-tab polling

/** Polls every 5 s while visible until the paid listing flips from `pending` to `live`. */
export function PendingPoll({ id }: { id: string }) {
  const router = useRouter()
  const [stopped, setStopped] = useState(false)
  const [checking, setChecking] = useState(false)

  const checkOnce = useCallback(async () => {
    try {
      const r = await fetch(`/api/listings/${id}`, { cache: 'no-store' })
      if (!r.ok) return false
      const j = await r.json().catch(() => null)
      if (j?.live) {
        router.refresh()
        return true
      }
    } catch { /* offline: try again */ }
    return false
  }, [id, router])

  useEffect(() => {
    let checks = 0
    const t = setInterval(async () => {
      if (document.hidden) return
      checks += 1
      const done = await checkOnce()
      if (done) { clearInterval(t); return }
      if (checks >= MAX_CHECKS) { clearInterval(t); setStopped(true) }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [checkOnce])

  async function manualCheck() {
    setChecking(true)
    await checkOnce()
    setChecking(false)
  }

  if (stopped) {
    return (
      <p className="h poll-note" role="status">
        Auto-check paused after 15 minutes.{' '}
        <button type="button" className="linkish" disabled={checking} onClick={manualCheck}>
          {checking ? 'Checking…' : 'Check payment status now'}
        </button>
      </p>
    )
  }
  return <p className="h poll-note">This page activates automatically as soon as your NervixPay payment confirms on-chain.</p>
}
