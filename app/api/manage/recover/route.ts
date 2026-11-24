import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS, readJsonBody } from '@/lib/http'
import { hashToken, ipHash, manageMail, manageUrl, newToken, sendMail } from '@/lib/owner'
import { RateLimiter } from '@/lib/rate-limit'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

const SAME = { ok: true, message: 'If that email owns listings, we just sent their manage links to it.' }
const MAX_BODY_BYTES = 4_096
const ipLimiter = new RateLimiter(5, 15 * 60 * 1000)
const emailLimiter = new RateLimiter(2, 15 * 60 * 1000)

/** Lost the manage link: mail a fresh one for every listing owned by this email (the old links stop
 *  working). Always answers the same, so it never reveals who has listings. */
export async function POST(req: Request) {
  if (process.env.VERCEL && store().kind === 'file') {
    return NextResponse.json({ error: 'Recovery is temporarily unavailable.' }, { status: 503, headers: NO_STORE_HEADERS })
  }
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
    return NextResponse.json(
      { error: 'Email is not set up yet. Write to the Nervix Space team to recover your listing.' },
      { status: 503, headers: NO_STORE_HEADERS },
    )
  }
  const ip = ipHash(req)
  const ipCheck = ipLimiter.take(ip)
  if (!ipCheck.ok) {
    return NextResponse.json(
      { error: 'Too many recovery requests. Please wait a few minutes and try again.' },
      { status: 429, headers: { ...NO_STORE_HEADERS, 'retry-after': String(ipCheck.retryAfterS) } },
    )
  }
  const parsed = await readJsonBody(req, MAX_BODY_BYTES)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: NO_STORE_HEADERS })
  const email = typeof parsed.data.email === 'string' ? parsed.data.email.trim().toLowerCase() : ''
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email)) {
    return NextResponse.json({ error: 'Your email address.' }, { status: 422, headers: NO_STORE_HEADERS })
  }

  // Per-email cooldown silently returns SAME so callers cannot probe whether an email has listings or lock out owners.
  const emailCheck = emailLimiter.take(hashToken(email))
  if (!emailCheck.ok) return NextResponse.json(SAME, { headers: NO_STORE_HEADERS })

  try {
    for (const l of (await store().byEmail(email)).slice(0, 10)) {
      const prevHash = l.edit_token_hash
      const token = newToken()
      const nextHash = hashToken(token)
      await store().update(l.id, { edit_token_hash: nextHash })
      const mailed = await sendMail(email, `Your Nervix Space listing: ${l.name}`, manageMail(l.name, manageUrl(l.id, token)))
      // Compare-and-swap rollback: only restore prevHash if no newer recovery already replaced nextHash.
      if (!mailed) {
        await store().update(l.id, { edit_token_hash: prevHash }, nextHash).catch((rollbackErr) => {
          console.error('recover rollback failed', l.id, rollbackErr)
        })
      }
    }
  } catch (e) { console.error('recover failed', e) }
  return NextResponse.json(SAME, { headers: NO_STORE_HEADERS })
}
