import { CATEGORIES, toPublic, type Listing, type PublicListing } from '@/lib/listing'
import { FOUNDING } from '@/lib/founding'

/** The lab mocks render the live public listings as of 16 Nov 2026 (founding projects + the two
 *  GrokBot listings, copied from GET /api/listings). No database, no writes, nothing invented. */
const PUBLISHED: Listing[] = [
  {
    id: 'lst_v3FOcEglI7qu', slug: 'grokbot', name: 'GrokBot', category: 'agents', offer: 'use', price: '',
    tagline: 'A Mac AI assistant integration with a public paper-trading research dashboard.',
    description: 'GrokBot is Dan’s Lab’s Mac Studio integration of the OpenMausBot open-source runtime, using the Codex CLI and an existing ChatGPT sign-in. The project also includes a separate paper-trading research service and public dashboard.',
    website: 'https://github.com/DansiDanutz/GrokBot', contact: 'https://github.com/DansiDanutz/GrokBot/issues', logo: '',
    pay_link: '', pay_mode: '', featured_until: null, status: 'active', created_at: '2026-10-31T22:46:45.010Z',
    owner_email: '', edit_token_hash: '', ip_hash: '', orders: [],
  },
  {
    id: 'lst_IFuwslIOpKya', slug: 'grokbot-opkya', name: 'GrokBot', category: 'trading', offer: 'use', price: 'Free dashboard',
    tagline: 'A paper-trading system run by a team of AI agents.',
    description: 'GrokBot runs trading bots, an AI-agent team and daily routines on the Mac Studio, all on paper money, and publishes its results on a public dashboard. Built in DansLab.',
    website: 'https://danslabtrader.vercel.app', contact: 'https://danslabtrader.vercel.app', logo: '',
    pay_link: '', pay_mode: '', featured_until: null, status: 'active', created_at: '2026-10-31T22:50:40.235Z',
    owner_email: '', edit_token_hash: '', ip_hash: '', orders: [],
  },
]

export const LISTINGS: PublicListing[] = [...FOUNDING, ...PUBLISHED].map(toPublic)

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Other'

/** Categories with how many listings each has, in the directory's order. */
export const categoryCounts = () =>
  CATEGORIES.map((c) => ({ ...c, count: LISTINGS.filter((l) => l.category === c.id).length }))

export const host = (url: string) => { try { return new URL(url).host.replace(/^www\./, '') } catch { return url } }

/** Exactly the claims in the brief. Shared so the three directions say the same thing. */
export const COPY = {
  network: 'The AI Business Network from DansLab',
  listFree: 'List your AI idea, app demo or production-ready app for free, in about 30 seconds.',
  paste: 'Paste a link and we fill in the name, description and logo.',
  pay: 'Add your own NervixPay link for a Buy or Subscribe button.',
  rails: 'USDT or USDC, wallet to wallet, verified on-chain, never custodied.',
  fee: 'NervixPay charges the seller 0.2%, capped at $2. Nervix Space takes nothing.',
  featured: 'Featured · 10 USD / 30 days',
  noAccounts: 'No accounts: you get a private manage link.',
} as const
