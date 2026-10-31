-- Nervix Market: run once in the Supabase SQL editor.
-- Only the server (service-role key, in Vercel env) reads and writes these tables:
-- RLS is on and there are no policies, so the anon key can see nothing.

create table if not exists listings (
  id text primary key,
  slug text not null unique,
  name text not null check (char_length(name) between 2 and 60),
  tagline text not null check (char_length(tagline) <= 90),
  description text not null check (char_length(description) <= 2000),
  category text not null,
  offer text not null check (offer in ('use', 'sell', 'both')),
  price text not null default '',
  website text not null,
  contact text not null default '',
  logo text not null default '',
  owner_email text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'hidden')),
  paid_until timestamptz,
  created_at timestamptz not null default now(),
  orders text[] not null default '{}'
);
create index if not exists listings_live on listings (status, paid_until);

create table if not exists membership_payments (
  order_id text primary key,            -- NervixPay order id: a webhook retry is a no-op
  listing_id text not null references listings (id),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table listings enable row level security;
alter table membership_payments enable row level security;
