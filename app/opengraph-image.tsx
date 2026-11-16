import { OG_SIZE, OG_TYPE, ogCard } from './og-card'

export const alt = 'Nervix Space: list your AI idea, app demo or production-ready app for free'
export const size = OG_SIZE
export const contentType = OG_TYPE

export default function Image() {
  return ogCard({
    eyebrow: 'The AI Business Network',
    title: 'Show it. Share it. Sell it.',
    line: 'List your AI idea, app demo or production-ready app for free. Sell it with NervixPay, wallet to wallet.',
  })
}
