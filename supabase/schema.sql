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

-- Atomically remember payment and activate membership; retries never extend twice.
create or replace function public.settle_market_membership(
  p_order_id text, p_listing_id text, p_detail jsonb, p_days integer
) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare
  current_until timestamptz;
  next_until timestamptz;
  inserted_order text;
begin
  if p_order_id is null or p_order_id = '' or p_days is null or p_days < 1 or p_days > 3660 then
    raise exception 'invalid membership payment';
  end if;
  select paid_until into current_until from public.listings where id = p_listing_id for update;
  if not found then raise exception 'unknown listing'; end if;
  insert into public.membership_payments(order_id, listing_id, detail)
    values(p_order_id, p_listing_id, p_detail)
    on conflict(order_id) do nothing returning order_id into inserted_order;
  if inserted_order is null then return null; end if;
  next_until := greatest(coalesce(current_until, now()), now()) + make_interval(days => p_days);
  update public.listings set status = 'active', paid_until = next_until where id = p_listing_id;
  return next_until;
end;
$$;
revoke all on function public.settle_market_membership(text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.settle_market_membership(text, text, jsonb, integer) to service_role;
