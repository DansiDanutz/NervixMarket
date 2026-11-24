/** Bounded in-memory sliding-window rate limiter.
 *  Zero dependencies; automatically prunes expired entries so memory stays bounded under random-IP floods. */
export interface LimitResult {
  ok: boolean
  remaining: number
  retryAfterS: number
}

export class RateLimiter {
  private hits = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  private prune(now: number) {
    const cutoff = now - this.windowMs
    for (const [k, times] of this.hits) {
      const fresh = times.filter((t) => t > cutoff)
      if (fresh.length) this.hits.set(k, fresh)
      else this.hits.delete(k)
    }
    if (this.hits.size >= this.maxKeys) {
      const drop = this.hits.size - Math.floor(this.maxKeys * 0.8)
      let i = 0
      for (const k of this.hits.keys()) {
        this.hits.delete(k)
        if (++i >= drop) break
      }
    }
  }

  check(key: string, now = Date.now()): LimitResult {
    const cutoff = now - this.windowMs
    const prev = (this.hits.get(key) ?? []).filter((t) => t > cutoff)
    if (prev.length >= this.max) {
      const oldest = prev[0] ?? now
      const retryAfterS = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000))
      return { ok: false, remaining: 0, retryAfterS }
    }
    return { ok: true, remaining: Math.max(0, this.max - prev.length), retryAfterS: 0 }
  }

  take(key: string, now = Date.now()): LimitResult {
    const cutoff = now - this.windowMs
    const prev = (this.hits.get(key) ?? []).filter((t) => t > cutoff)
    if (prev.length >= this.max) {
      this.hits.set(key, prev)
      const oldest = prev[0] ?? now
      const retryAfterS = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000))
      return { ok: false, remaining: 0, retryAfterS }
    }
    if (this.hits.size >= this.maxKeys && !this.hits.has(key)) this.prune(now)
    const next = [...prev, now]
    this.hits.set(key, next)
    return { ok: true, remaining: Math.max(0, this.max - next.length), retryAfterS: 0 }
  }

  reset() {
    this.hits.clear()
  }
}
