'use client'

import { useState } from 'react'

/** Accessible one-click copy button with clipboard error fallback. */
export function CopySnippet({
  label,
  code,
  inline = false,
}: {
  label: string
  code: string
  inline?: boolean
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(code)
      setState('copied')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('failed')
    }
  }

  return (
    <div className={inline ? 'copy-inline' : 'copy-block'}>
      <div className="copy-head">
        <span>{label}</span>
        <button type="button" className="btn ghost copy-btn" onClick={copy}>
          {state === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
      {state === 'failed' && <p className="h" role="status">Select the snippet above and copy it manually.</p>}
    </div>
  )
}
