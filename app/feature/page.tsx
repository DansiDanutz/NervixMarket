import Link from 'next/link'
import { browse } from '@/lib/store'
import { FEATURE_USD } from '@/lib/listing'

export const dynamic = 'force-dynamic'

export default async function ChooseProject({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q, page } = await searchParams
  const results = await browse({ q }, Number(page ?? 1))
  const projects = results.items.filter(p => p.id.startsWith('lst_'))
  const pageHref = (n: number) => '/feature?' + new URLSearchParams({ q: q ?? '', page: String(n) })
  return <main className="wrap page">
    <h1>Choose the project to feature</h1>
    <p>Feature a published listing for 30 days for ${FEATURE_USD} USD. Choose your project to review the details before paying.</p>
    <form action="/feature"><label>Project name <input name="q" defaultValue={q} /></label> <button className="btn ghost">Search</button></form>
    {projects.length ? <ul>{projects.map(p => <li key={p.id}><Link href={`/feature/${p.id}`}>{p.name}</Link></li>)}</ul> : <p>No matching listings on this page.</p>}
    {results.page > 1 && <Link href={pageHref(results.page - 1)}>Previous page</Link>}
    {results.page < results.pages && <Link href={pageHref(results.page + 1)}>Next page</Link>}
    <p>Not listed yet? <Link href="/list">List your project first</Link>.</p>
  </main>
}
