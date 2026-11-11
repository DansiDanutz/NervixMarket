import { NextResponse } from 'next/server'
import { hashToken, manageMail, manageUrl, newToken, sendMail } from '@/lib/owner'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

const SAME = { ok: true, message: 'If that email owns listings, we just sent their manage links to it.' }

/** Lost the manage link: mail a fresh one for every listing owned by this email (the old links stop
 *  working). Always answers the same, so it never reveals who has listings. */
export async function POST(req: Request) {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
    return NextResponse.json({ error: 'Email is not set up yet. Write to the Nervix Space team to recover your listing.' }, { status: 503 })
  }
  let email = ''
  try { email = String(((await req.json()) ?? {}).email ?? '').trim().toLowerCase() } catch { /* fall through */ }
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email)) return NextResponse.json({ error: 'Your email address.' }, { status: 422 })
  try {
    for (const l of (await store().byEmail(email)).slice(0, 10)) {
      const token = newToken()
      await store().update(l.id, { edit_token_hash: hashToken(token) })
      await sendMail(email, `Your Nervix Space listing: ${l.name}`, manageMail(l.name, manageUrl(l.id, token)))
    }
  } catch (e) { console.error('recover failed', e) }
  return NextResponse.json(SAME)
}
