import type { Listing } from './listing'

/** DansLab's own projects: the first members of the network. Facts come from the projects' own
 *  sites; nothing here claims numbers or a status that isn't public. */
const base = {
  status: 'active' as const, owner_email: '', orders: [], founding: true, edit_token_hash: '', ip_hash: '',
  created_at: '2026-11-01T00:00:00.000Z', logo: '', contact: '', pay_link: '', pay_mode: '' as const, featured_until: null,
}

export const FOUNDING: Listing[] = [
  {
    ...base, id: 'founding-fake-real', slug: 'fake-real', name: 'Fake / Real',
    tagline: 'Paste a link, get REAL or FAKE with the sources.',
    description: 'A fact-check tool for public articles, posts and websites, powered by the JEV evidence engine. It reads the page, extracts the factual claims, searches outside sources and compares them. Every result explains why, and when there is not enough evidence it says so. Three free checks a day, no account needed, in English and Romanian.',
    category: 'tools', offer: 'use', price: 'Free: 3 checks a day', website: 'https://fake-real.live',
  },
  {
    ...base, id: 'founding-nervixpay', slug: 'nervixpay', name: 'NervixPay',
    tagline: 'Accept crypto payments as easily as a QR code.',
    description: 'Non-custodial crypto checkout for merchants and AI agents. Customers pay from their own wallet straight to yours; every payment is verified on-chain and NervixPay never touches the funds. USDC and USDT on Polygon, Ethereum and BNB Chain, payment links, pay buttons, a REST API with signed webhooks, and expiring keys for agents. Every seller in Nervix Space can take payments and subscriptions with it, and Featured spots are paid with it.',
    category: 'tools', offer: 'use', price: '0.2% per payment, capped at $2', website: 'https://nervixpay.live',
  },
  {
    ...base, id: 'founding-zmarty', slug: 'zmarty', name: 'Zmarty',
    tagline: 'An AI trading companion: a team of agents watching the markets.',
    description: 'Not just a chatbot: a team of specialised AI agents that analyse the markets around the clock and explain what they see, in a WhatsApp-style chat with voice. The more you talk to it, the better it knows your trading style.',
    category: 'trading', offer: 'use', price: '', website: 'https://github.com/DansiDanutz',
  },
  {
    ...base, id: 'founding-streamstudio', slug: 'streamstudio', name: 'StreamStudio',
    tagline: 'A script-driven studio for recording and streaming YouTube videos.',
    description: 'Write the script; StreamStudio directs the scenes, cards, gestures and layouts, records the program to MP4 or streams it live. AI agents (Claude, Codex, GrokBot) can build and edit videos through its artifact library and MCP server. The DansLab presentation of this network was made with it.',
    category: 'content', offer: 'use', price: 'Open source', website: 'https://github.com/DansiDanutz/StreamStudio',
  },
]
