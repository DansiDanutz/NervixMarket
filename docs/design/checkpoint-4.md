# Checkpoint 4: audits, before and after

Lighthouse 12.2.1 (headless Chromium 131, default throttling, one run per row). It ran on the Mac mini against
production builds of `main` (before) and this branch (after). Both builds used the same mock Supabase with the same
listing. Live production was measured the same way on 16 Nov 2026.

## Mobile

| Route | Perf | LCP | TBT | CLS | Page | JS |
|---|---|---|---|---|---|---|
| `/` | 86 → **99** | 2.41 → 2.13 s | 0 → 0 ms | 0.188 → **0** | 230 → 201 KB | 110 → 112 KB |
| `/?for=build` | 86 → **99** | 2.71 → 2.11 s | 0 → 4 ms | 0.160 → **0** | 217 → 206 KB | 110 → 113 KB |
| `/sell` | 99 → 99 | 1.81 → 2.17 s | 0 → 6 ms | 0.007 → 0 | 227 → 193 KB | 110 → 110 KB |
| `/list` | 99 → 99 | 1.91 → 2.27 s | 3 → 2 ms | 0 → 0 | 224 → 198 KB | 110 → 116 KB |
| `/l/grokbot` | **500** → 98 | n/a → 2.28 s | n/a → 1 ms | n/a → 0 | n/a → 211 KB | n/a → 119 KB |

Accessibility is 100 on every route, before and after. Best practices go from 96 to 100: `main` logs console
errors. SEO is 100 after. Desktop performance is 100 on every route after; `main`'s home page scored 90.

**Live production (nervix.space, mobile):** home 82 (LCP 2.81 s, CLS 0.190). `/l/grokbot` returns 500. The brief's
59 / TBT 5,140 ms was not reproduced with this setup. It was probably measured with PageSpeed Insights on other hardware.

## Budgets (after)

| Budget | Result |
|---|---|
| LCP < 2.5 s (mobile) | 2.11–2.28 s ✓ |
| CLS < 0.1 | 0 ✓ |
| TBT < 200 ms | ≤ 6 ms ✓ |
| Perf ≥ 90 | 98–100 ✓ |
| Home JS ≤ 120 KB gz | 112 KB transferred ✓ (close to the limit) |
| Page ≤ 300 KB | 193–217 KB ✓ |
| ≤ 2 font families | Space Grotesk + Inter, self-hosted ✓ |

INP was not measured: Lighthouse navigation runs have no interactions. TBT is the lab proxy.

## Other checks
- **axe** (wcag2a/aa, 21aa, 22aa): 0 violations on 14 views (home in both modes, sell, sell at the cap, list,
  listing, 404; each at 1440 and 390).
- **Keyboard** at 390, with motion reduced and not: the first Tab reaches a visible skip link, and every focus stop
  in the first 12 Tabs shows an outline. `/list` autofocuses the link field, so it starts there instead.
- **Targets:** standalone controls are ≥ 44px. Links inside sentences (footer "NervixPay", the list form's
  payment-link sentence) are smaller, which WCAG 2.5.8 exempts.
- **Motion:** no running animations on any route, with or without reduced motion.
- **`lang="en"`:** present on every route. The 404's server HTML still lacks it until hydration; see open items.
- **Preview with real data:** home 200 with six listings, both GrokBots distinct; `/sitemap.xml` lists both
  database listings; listing OG images render.

## Fixed during this audit
- `/sell` read `?price=`, which made it dynamic and streamed its metadata into `<body>` (Lighthouse: no meta
  description). It is static again.
- Heading order in building mode: the preview card title is now an h2.
- Standalone listing links are now 44px tall.

## Open
- **M:** the store tests `paginates` and the Featured ordering test are flaky on `main` too (created_at ties).
  The fix is in `lib/store.ts`, which needs Dan's OK.
- **L:** bf-cache is blocked on per-request pages (`no-store`). Any change is the caching decision the brief reserves.
- **L:** the 404 server HTML lacks `lang` until hydration (Next's error shell).
- **L:** `/manage`, `/feature` and `/pending` were restyled only and not exercised end-to-end (they need real tokens or payments).
- **Not run:** unlighthouse, uxaudit and impeccable. An axe test in CI needs `@playwright/test` as a dev dependency;
  proposed, not added.
