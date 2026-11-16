import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import './lab.css'

export const metadata: Metadata = { title: 'Design lab · Nervix Space', robots: { index: false, follow: false } }

/** Design-direction mocks for review on previews. Never served in production. */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (process.env.VERCEL_ENV === 'production') notFound()
  return <div className="lab-root">{children}</div>
}
