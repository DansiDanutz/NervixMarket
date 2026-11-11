'use client'

import { useState } from 'react'

/** "Report this listing": spam, scam or broken. Enough distinct reports hide it until reviewed. */
export function Report({ id }: { id: string }) {
  const [state, setState] = useState<'idle' | 'ask' | 'sent'>('idle')
  if (state === 'sent') return <span>Thanks, the team will take a look.</span>
  if (state === 'ask') {
    return (
      <span>Report this listing as spam, a scam or broken?{' '}
        <button className="linkish" onClick={async () => { await fetch(`/api/listings/${id}/report`, { method: 'POST' }).catch(() => {}); setState('sent') }}>Yes, report</button>{' '}
        <button className="linkish" onClick={() => setState('idle')}>Cancel</button>
      </span>
    )
  }
  return <button className="linkish" onClick={() => setState('ask')}>Report</button>
}
