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

/** Cron endpoints accept `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) or `<ADMIN_TOKEN>`. Fail-closed when unset. */
export function isCronAuthorized(req: Request): boolean {
  if (isAdmin(req)) return true
  const want = process.env.CRON_SECRET
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

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export const featuredMail = (opts: {
  name: string
  slug: string
  id: string
  untilIso: string
  orderId: string
  amount?: string | number
  token?: string
  network?: string
}) => {
  const base = siteUrl()
  const paidLine = opts.amount && opts.token
    ? `Payment: ${opts.amount} ${opts.token}${opts.network ? ` (${opts.network})` : ''} · Order ${opts.orderId}`
    : `Order: ${opts.orderId}`
  return [
    `Your project "${opts.name}" is now Featured on Nervix Space.`,
    '',
    `Featured until: ${fmtDate(opts.untilIso)} (UTC)`,
    paidLine,
    '',
    `Live listing: ${base}/l/${opts.slug}`,
    `Extend anytime: ${base}/feature/${opts.id}`,
    '',
    'Thank you for building in Nervix Space.',
    'Nervix Space',
  ].join('\n')
}

export const featureExpiringMail = (opts: { name: string; slug: string; id: string; untilIso: string }) => {
  const base = siteUrl()
  return [
    `Your Featured spot for "${opts.name}" on Nervix Space ends on ${fmtDate(opts.untilIso)} (UTC).`,
    '',
    'Your listing stays live for free after that. If you want to keep pinned placement at the top of the directory and your Featured badge, you can extend for another 30 days here:',
    `${base}/feature/${opts.id}`,
    '',
    `Live listing: ${base}/l/${opts.slug}`,
    '',
    'Nervix Space',
  ].join('\n')
}

/** Refresh cached pages after a change; a no-op outside a Next.js request (tests). */
export async function refresh(...paths: string[]) {
  try {
    const { revalidatePath } = await import('next/cache')
    for (const p of paths) revalidatePath(p)
  } catch { /* not in a Next.js request */ }
}
