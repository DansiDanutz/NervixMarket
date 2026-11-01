# Nervix Space — nervix.space

**A space for what you build with AI. Show it. Share it. Sell it.** The home of the DansLab AI Business
Network: anyone can bring an idea, an app demo, or a production-ready app (to use or to buy).

- **The first 200 projects join for free, for good** (`FREE_SPOTS` in `lib/listing.ts`): the listing goes live
  as soon as it is submitted. Free listings are marked by `paid_until = FREE_UNTIL` (2999-12-31), so no schema change.
- From project 201 on, a listing goes public once its **10 USD membership** is paid in **USDT or USDC through
  NervixPay** (wallet to wallet, verified on-chain, never custodied). Membership lasts `MEMBERSHIP_DAYS`
  (30 by default: 10 USD a month); paying again extends it by another month.

## How the payment works (after the free spots)
1. The form creates a **pending** listing (not public) and sends the owner to the NervixPay membership
   link with `?ref=<listing id>&email=<owner email>`.
2. NervixPay settles the payment and POSTs a signed `payment.paid` webhook to
   `/api/webhooks/nervixpay`.
3. The webhook checks the HMAC signature (5-minute replay window), that the payment is on the membership
   link, in USDT/USDC, for at least 10 USD, then turns the listing **active**. Retries are no-ops
   (keyed on the NervixPay order id). The pending page notices and shows "You're in the space."

## Setup (once)
1. **NervixPay** (nervixpay.live, signed in as the merchant):
   - Create a payment link "Nervix Space membership", fixed price **10 USD**, accepting **USDT and USDC**.
     Copy its id → `NERVIXPAY_LINK_ID`.
   - Integrations → Payment webhook → `https://<your domain>/api/webhooks/nervixpay`. Copy the secret it shows
     once → `NERVIXPAY_WEBHOOK_SECRET`.
2. **Supabase**: run `supabase/schema.sql` in the SQL editor. Put the project URL and a
   **secret key** (`sb_secret_…`, Project Settings → API Keys; or the legacy service-role key if legacy keys are on) in `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (server-side only; RLS blocks the anon key).
3. **Vercel**: import the repo, add the four variables above (and optionally `MEMBERSHIP_DAYS`), deploy.

Without Supabase the app stores listings in `.data/listings.json` (local development only).

## API (agents can use it)
- `GET /api/listings?q=&category=&offer=` — live listings (never the owner's email)
- `POST /api/listings` — submit; returns `{ id, checkout, pending }`
- `GET /api/listings/:id` — public state, `live: true` once paid

## Develop
```bash
npm install
npm run dev     # http://localhost:3300
npm test        # validation, search, signature, membership rules, submit → pay → live
npm run build
```
