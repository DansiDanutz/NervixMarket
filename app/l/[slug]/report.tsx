'use client'

import { useState } from 'react'

/** "Report this listing": spam, scam or broken. Enough distinct reports hide it until reviewed. */
export function Report({ id }: { id: string }) {
  const [state, setState] = useState<'idle' | 'ask' | 'sending' | 'sent' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function submit() {
    setState('sending')
    setErrMsg('')
    try {
      const r = await fetch(`/api/listings/${id}/report`, { method: 'POST' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(typeof j.error === 'string' ? j.error : 'Could not send report right now.')
      }
      setState('sent')
    } catch (e) {
      setErrMsg((e as Error).message || 'Could not send report right now.')
      setState('error')
    }
  }

  if (state === 'sent') return <span role="status">Thanks, the team will take a look.</span>
  if (state === 'error') {
    return (
      <span role="alert">
        {errMsg}{' '}
        <button type="button" className="linkish" onClick={submit}>Try again</button>{' '}
        <button type="button" className="linkish" onClick={() => setState('idle')}>Cancel</button>
      </span>
    )
  }
  if (state === 'ask' || state === 'sending') {
    return (
      <span>Report this listing as spam, a scam or broken?{' '}
        <button type="button" className="linkish" disabled={state === 'sending'} onClick={submit}>
          {state === 'sending' ? 'Sending…' : 'Yes, report'}
        </button>{' '}
        <button type="button" className="linkish" disabled={state === 'sending'} onClick={() => setState('idle')}>Cancel</button>
      </span>
    )
  }
  return <button type="button" className="linkish" onClick={() => setState('ask')}>Report</button>
}
