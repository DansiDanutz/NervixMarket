/** Where an owner is on the listing form: 1 the link, 2 the required details, 3 ready to publish.
 *  Derived from the values on every render, never stored. */
export const HTTPS_URL = /^https:\/\/\S+\.\S+/

const REQUIRED = ['name', 'tagline', 'category', 'owner_email'] as const

export function progress(v: Record<string, string | undefined>): 1 | 2 | 3 {
  if (!HTTPS_URL.test((v.website ?? '').trim())) return 1
  return REQUIRED.every((k) => (v[k] ?? '').trim()) ? 3 : 2
}
