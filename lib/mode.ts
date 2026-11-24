/** The one upfront choice on the home page: is the visitor looking for AI tools, or building one?
 *  The URL (?for=) is the source of truth; a cookie remembers it for a bare visit to "/". */

export type Mode = 'look' | 'build'

export const MODE_COOKIE = 'ns_for'
const MODES: readonly Mode[] = ['look', 'build']
const OFFER_IDS = ['use', 'sell', 'both'] as const
/** `?offer=any` clears the mode's default filter. */
export const ANY_OFFER = 'any'

const isMode = (v: unknown): v is Mode => MODES.includes(v as Mode)

export function resolveMode(fromUrl?: string, fromCookie?: string): Mode {
  if (isMode(fromUrl)) return fromUrl
  if (isMode(fromCookie)) return fromCookie
  return 'look'
}

/** Builders land on what's for sale (to see how others sell); lookers see everything. An explicit filter wins. */
export function resolveOffer(mode: Mode, offerParam?: string): string | undefined {
  if (offerParam === ANY_OFFER) return undefined
  if (OFFER_IDS.includes(offerParam as (typeof OFFER_IDS)[number])) return offerParam
  return mode === 'build' ? 'sell' : undefined
}

export interface HomeCopy { h1: string; lead: string; cta: { label: string; href: string } }

const COPY: Record<Mode, HomeCopy> = {
  look: {
    h1: 'AI tools people built, to use or to buy.',
    lead: 'Ideas, app demos and production-ready apps. Some you can buy or subscribe to, paying the builder directly.',
    cta: { label: 'Explore the directory', href: '#directory' },
  },
  build: {
    h1: 'Paste your link. Your listing is ready.',
    lead: 'List your AI idea, app demo or production-ready app for free, in about 30 seconds. Paste a link and we fill in the name, description and logo.',
    cta: { label: 'List your project free', href: '/list' },
  },
}

export const homeCopy = (mode: Mode): HomeCopy => COPY[mode]

/** Link that switches mode, keeping the search and filters but starting again from page 1. */
export function modeHref(mode: Mode, current: { q?: string; category?: string; offer?: string; page?: string }): string {
  const params = new URLSearchParams({ for: mode })
  for (const key of ['q', 'category', 'offer'] as const) {
    const value = current[key]
    if (value) params.set(key, value)
  }
  return `/?${params.toString()}`
}
