import { Inter, Space_Grotesk } from 'next/font/google'

/** The site's two families, self-hosted by next/font (no request to Google at runtime). */
export const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '700'], display: 'swap', variable: '--font-display' })
export const body = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-body' })
