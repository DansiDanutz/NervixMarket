import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/http'
import { featureExpiringMail, isCronAuthorized, sendMail } from '@/lib/owner'
import { store } from '@/lib/store'

export const dynamic = 'force-dynamic'

const REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000

async function run(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS })
  }
  if (process.env.VERCEL && store().kind === 'file') {
    return NextResponse.json({ error: 'database not configured' }, { status: 503, headers: NO_STORE_HEADERS })
  }
  try {
    const now = Date.now()
    const fromIso = new Date(now).toISOString()
    const toIso = new Date(now + REMINDER_WINDOW_MS).toISOString()
    const candidates = await store().expiringFeatured(fromIso, toIso)
    let sent = 0
    let failed = 0
    for (const l of candidates) {
      if (!l.featured_until) continue
      const ok = await sendMail(
        l.owner_email,
        `Your Nervix Space Featured spot ends soon: ${l.name}`,
        featureExpiringMail({ name: l.name, slug: l.slug, id: l.id, untilIso: l.featured_until }),
      )
      if (ok) {
        await store().update(l.id, { feature_reminder_for: l.featured_until })
        sent++
      } else {
        failed++
      }
    }
    return NextResponse.json({ ok: true, checked: candidates.length, sent, failed }, { status: 200, headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error('featured expiry reminders failed', err)
    return NextResponse.json({ error: 'reminder job unavailable' }, { status: 503, headers: NO_STORE_HEADERS })
  }
}

/** Daily Vercel Cron (GET) or operator trigger (POST) for 48h Featured expiry reminders. */
export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
