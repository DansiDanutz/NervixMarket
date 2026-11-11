import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** Owners have no accounts: each listing has a private manage token. Only its sha256 is stored; the token
 *  itself is shown once after listing (and mailed, when mail is set up). The manage link carries it in the
 *  URL fragment (#…), which browsers never send to servers or in Referer headers. */
export const newToken = () => randomBytes(24).toString('base64url')
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

export function tokenMatches(token: string | null | undefined, hash: string): boolean {
  if (!token || !hash || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return false
  const a = Buffer.from(hashToken(token), 'hex'), b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export const siteUrl = () => (process.env.SITE_URL || 'https://nervix.space').replace(/\/$/, '')
export const manageUrl = (id: string, token: string) => `${siteUrl()}/manage/${id}#${token}`

/** A salted hash of the caller's IP (Vercel sets x-forwarded-for / x-real-ip). Raw IPs are never stored. */
export function ipHash(req: Request): string {
  const ip = (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim()
  return createHash('sha256').update(`${process.env.IP_SALT || 'nervix-space'}:${ip}`).digest('hex').slice(0, 32)
}

/** Admin calls carry `Authorization: Bearer <ADMIN_TOKEN>`. Off when ADMIN_TOKEN is unset. */
export function isAdmin(req: Request): boolean {
  const want = process.env.ADMIN_TOKEN
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!want || want.length < 16) return false
  const a = Buffer.from(hashToken(got)), b = Buffer.from(hashToken(want))
  return timingSafeEqual(a, b)
}

/** Sends mail through Resend when RESEND_API_KEY and MAIL_FROM are set; otherwise does nothing.
 *  Returns whether a mail was sent. Never throws. */
export async function sendMail(to: string, subject: string, text: string, f: typeof fetch = fetch): Promise<boolean> {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM
  if (!key || !from) return false
  try {
    const r = await f('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    })
    if (!r.ok) console.error('mail failed', r.status, (await r.text()).slice(0, 200))
    return r.ok
  } catch (e) { console.error('mail failed', e); return false }
}

export const manageMail = (name: string, link: string) =>
  `Your project "${name}" is listed on Nervix Space.\n\nThis is your private link to edit, pause or delete it. Keep it safe: anyone with it can change your listing.\n\n${link}\n\nWant buyers to pay you directly? Create a payment link on NervixPay (https://nervixpay.live) and paste it in your listing.\n\nNervix Space`

/** Refresh cached pages after a change; a no-op outside a Next.js request (tests). */
export async function refresh(...paths: string[]) {
  try {
    const { revalidatePath } = await import('next/cache')
    for (const p of paths) revalidatePath(p)
  } catch { /* not in a Next.js request */ }
}
