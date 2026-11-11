import { redirect } from 'next/navigation'

/** Old links from the paid-membership days. */
export default async function Pending({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/feature/${encodeURIComponent((await params).id)}`)
}
