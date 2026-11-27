import { config } from './nervixpay'
import type { GenesisStatus } from './store'

/** Can the site take money and reach owners? Only booleans and plain-language warnings: never values.
 *  Served by /api/health so the operator (or an uptime monitor) can see a missing setting before
 *  it costs a sale, e.g. the #201 listing checkout before the Genesis 200 run out. */
export interface Readiness {
  ready: boolean
  checkout: { featured: boolean; listing: boolean; webhook: boolean }
  mail: boolean
  genesis: { cap: number; claimed: number; remaining: number }
  warnings: string[]
}

/** Warn this many spots before the free Genesis run out. */
export const GENESIS_WARN_AT = 20

export function readiness(genesis: GenesisStatus, env: NodeJS.ProcessEnv = process.env): Readiness {
  const c = config()
  const checkout = { featured: !!c.linkId, listing: !!c.listingLinkId, webhook: !!c.secret }
  const mail = !!(env.RESEND_API_KEY && env.MAIL_FROM)
  const warnings: string[] = []
  if (!checkout.webhook) warnings.push('NERVIXPAY_WEBHOOK_SECRET is not set: no payment can be confirmed.')
  if (!checkout.listing) {
    if (genesis.remaining === 0) warnings.push(`All ${genesis.cap} Genesis spots are taken and NERVIXPAY_LISTING_LINK_ID is not set: new listings stay pending with no way to pay.`)
    else if (genesis.remaining <= GENESIS_WARN_AT) warnings.push(`Only ${genesis.remaining} Genesis spots left and NERVIXPAY_LISTING_LINK_ID is not set: listing #${genesis.cap + 1} will have no way to pay.`)
  }
  if (!checkout.featured) warnings.push('NERVIXPAY_LINK_ID is not set: Featured spots cannot be bought.')
  if (!mail) warnings.push('RESEND_API_KEY / MAIL_FROM are not set: manage links are shown once on screen only, and lost links cannot be recovered.')
  return {
    ready: warnings.length === 0,
    checkout, mail,
    genesis: { cap: genesis.cap, claimed: genesis.claimed, remaining: genesis.remaining },
    warnings,
  }
}
