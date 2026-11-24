/** Bounded request-body readers for API routes. Prevents memory DoS from oversized payloads
 *  and guarantees callers receive plain JSON objects when expected. */

export async function readTextBody(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; status: 413; error: string }> {
  const len = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(len) && len > maxBytes) {
    return { ok: false, status: 413, error: 'Request body is too large.' }
  }
  if (!req.body) {
    const text = await req.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      return { ok: false, status: 413, error: 'Request body is too large.' }
    }
    return { ok: true, text }
  }
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        reader.cancel().catch(() => {})
        return { ok: false, status: 413, error: 'Request body is too large.' }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return { ok: true, text: new TextDecoder().decode(Buffer.concat(chunks)) }
}

export async function readJsonBody(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: 400 | 413; error: string }> {
  const raw = await readTextBody(req, maxBytes)
  if (!raw.ok) return raw
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.text)
  } catch {
    return { ok: false, status: 400, error: 'Send JSON.' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: 'Send a JSON object.' }
  }
  return { ok: true, data: parsed as Record<string, unknown> }
}

export const NO_STORE_HEADERS = { 'cache-control': 'no-store' } as const
