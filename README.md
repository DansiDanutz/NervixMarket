# Nervix Space — nervix.space

**A space for what you build with AI. Show it. Share it. Sell it.** The home of the DansLab AI Business
Network: anyone can list an idea, an app demo, or a production-ready app, **for free**.

- **Listing is free for everyone, live at once.** Paste the project's link: the form reads the page's name,
  description and logo (`/api/prefill`), you pick a category and add your email. About 30 seconds.
- **No accounts.** Each listing gets a private manage link (`/manage/<id>#<token>`; only a sha256 of the token is
  stored, and the `#fragment` never reaches a server). It is shown once after listing and emailed when Resend
  is set up. Lost it? `/api/manage/recover` mails a fresh one to the owner's email.
- **Sell or subscribe with NervixPay.** Owners paste their own NervixPay payment link (`https://nervixpay.live/l/<id>`)
  and choose one-time purchase or subscription; their page gets a Buy / Subscribe button. Buyers pay the owner's
  wallet directly; Nervix Space never touches the money and takes no cut. `/sell` explains the setup.
- **Featured (the paid extra): 10 USD in USDT/USDC through NervixPay** shows a listing first for `FEATURE_DAYS`
  (30). Anyone can feature a live listing from `/feature/<id>`; paying again extends it.
- **Moderation.** Hidden honeypot field, `LISTINGS_PER_HOUR` per IP (5), and a Report link: `REPORTS_TO_HIDE`
  distinct reports (5) hide a listing until an admin restores it via the admin API.

## How a Featured payment works
1. `/feature/<id>` sends the payer to the Featured NervixPay link with `?ref=<listing id>`.
2. NervixPay settles the payment and POSTs a signed `payment.paid` webhook to `/api/webhooks/nervixpay`.
3. The webhook checks the HMAC signature (5-minute replay window), that the payment is on the Featured link,
   in USDT/USDC, for at least 10 USD, then extends `featured_until` atomically (`settle_market_feature`).
   Retries are no-ops (keyed on the NervixPay order id).

## Setup
1. **Supabase**: a new database runs `supabase/schema.sql`, then every file in `supabase/migrations/` in order.
   An existing database only needs the new migration(s). Put the project URL and a **secret key** (`sb_secret_…`)
   in `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (server-side only; RLS blocks the anon key).
2. **NervixPay** (nervixpay.live, as the merchant): a payment link "Nervix Space Featured", fixed **10 USD**, USDT
   and USDC → `NERVIXPAY_LINK_ID`. Integrations → Payment webhook → `https://nervix.space/api/webhooks/nervixpay`;
   its secret → `NERVIXPAY_WEBHOOK_SECRET`.
3. **Vercel**: the variables in `.env.example`. Optional: `RESEND_API_KEY` + `MAIL_FROM` (mailing manage links),
   `ADMIN_TOKEN` (moderation).

## API (agents can use it)
- `GET /api/listings?q=&category=&offer=&page=` — live listings, 36 a page, featured first (never private fields)
- `POST /api/listings` — submit; returns `{ id, slug, page, manage, mailed }`
- `GET /api/listings/:id` — public state; with `x-manage-token`, also the owner's view
- `PATCH /api/listings/:id` / `DELETE /api/listings/:id` — owner edits, `status: active|paused`, delete (`x-manage-token`)
- `POST /api/listings/:id/report` — flag a listing
- `GET /api/prefill?url=` — suggested fields from a public https page
- `PATCH /api/admin/listings/:id` — `{ status: active|hidden|removed }` with `Authorization: Bearer $ADMIN_TOKEN`

## Develop
```bash
npm install
npm run dev     # http://localhost:3300
npm test        # validation, pay links, prefill safety, manage tokens, moderation, Featured payments
npm run build
```
