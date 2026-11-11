-- Nervix Space: open listings. Run once in the Supabase SQL editor on a database created from the old
-- schema.sql (safe to run twice). Free listings for everyone, owner manage tokens, the owner's NervixPay
-- link, Featured spots, reports, and full-text search done in the database.

-- statuses: active · paused (by the owner) · hidden (moderation) · removed (deleted by the owner); pending is legacy
alter table listings drop constraint if exists listings_status_check;
alter table listings add constraint listings_status_check check (status in ('pending', 'active', 'paused', 'hidden', 'removed'));
alter table listings alter column status set default 'active';

alter table listings add column if not exists pay_link text not null default '';
alter table listings add column if not exists pay_mode text not null default '';
alter table listings drop constraint if exists listings_pay_mode_check;
alter table listings add constraint listings_pay_mode_check check (pay_mode in ('', 'buy', 'subscribe'));
alter table listings add column if not exists featured_until timestamptz;
alter table listings add column if not exists edit_token_hash text not null default '';
alter table listings add column if not exists ip_hash text not null default '';
alter table listings add column if not exists updated_at timestamptz not null default now();
alter table listings add column if not exists search tsvector generated always as (
  to_tsvector('simple', name || ' ' || tagline || ' ' || description || ' ' || price)
) stored;

create index if not exists listings_search on listings using gin (search);
create index if not exists listings_browse on listings (status, category, created_at desc);
create index if not exists listings_featured on listings (featured_until) where featured_until is not null;
create index if not exists listings_ip on listings (ip_hash, created_at);
create index if not exists listings_owner on listings (owner_email);

-- Listing is free now: listings that were waiting for the old membership payment go live.
update listings set status = 'active' where status = 'pending';

create table if not exists listing_reports (
  listing_id text not null references listings (id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  primary key (listing_id, ip_hash)
);
alter table listing_reports enable row level security;

-- One page of live listings: every word must match as a word prefix; featured first, then newest.
create or replace function public.search_listings(p_q text, p_category text, p_offer text, p_limit integer, p_offset integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_words text := btrim(regexp_replace(lower(coalesce(p_q, '')), '[^[:alnum:]]+', ' ', 'g'));
  v_q tsquery;
  v_total bigint;
  v_items jsonb;
begin
  if v_words <> '' then
    select to_tsquery('simple', string_agg(w || ':*', ' & ')) into v_q from regexp_split_to_table(v_words, ' ') as w;
  end if;
  with m as (
    select l.* from public.listings l
    where l.status = 'active'
      and (coalesce(p_category, '') = '' or l.category = p_category)
      and (coalesce(p_offer, '') = '' or l.offer = p_offer or (p_offer <> 'both' and l.offer = 'both'))
      and (v_q is null or l.search @@ v_q)
  ), pg as (
    select * from m
    order by coalesce(m.featured_until > now(), false) desc, m.created_at desc
    limit greatest(least(coalesce(p_limit, 36), 5000), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select (select count(*) from m),
         coalesce((select jsonb_agg(to_jsonb(pg) - 'owner_email' - 'orders' - 'edit_token_hash' - 'ip_hash' - 'search' - 'paid_until'
                   order by coalesce(pg.featured_until > now(), false) desc, pg.created_at desc) from pg), '[]'::jsonb)
    into v_total, v_items;
  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- One report per IP per listing; at p_threshold distinct reports a live listing is hidden for review.
create or replace function public.report_listing(p_listing_id text, p_ip_hash text, p_threshold integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  insert into public.listing_reports(listing_id, ip_hash) values (p_listing_id, p_ip_hash) on conflict do nothing;
  select count(*) into n from public.listing_reports where listing_id = p_listing_id;
  if n >= p_threshold then
    update public.listings set status = 'hidden', updated_at = now() where id = p_listing_id and status = 'active';
  end if;
  return n;
end;
$$;

-- Atomically remember a Featured payment and extend featured_until; retries never extend twice.
create or replace function public.settle_market_feature(
  p_order_id text, p_listing_id text, p_detail jsonb, p_days integer
) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare
  current_until timestamptz;
  next_until timestamptz;
  inserted_order text;
begin
  if p_order_id is null or p_order_id = '' or p_days is null or p_days < 1 or p_days > 3660 then
    raise exception 'invalid feature payment';
  end if;
  select featured_until into current_until from public.listings where id = p_listing_id for update;
  if not found then raise exception 'unknown listing'; end if;
  insert into public.membership_payments(order_id, listing_id, detail)
    values(p_order_id, p_listing_id, p_detail)
    on conflict(order_id) do nothing returning order_id into inserted_order;
  if inserted_order is null then return null; end if;
  next_until := greatest(coalesce(current_until, now()), now()) + make_interval(days => p_days);
  update public.listings set featured_until = next_until, orders = array_append(orders, p_order_id), updated_at = now()
    where id = p_listing_id;
  return next_until;
end;
$$;

revoke all on function public.search_listings(text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.report_listing(text, text, integer) from public, anon, authenticated;
revoke all on function public.settle_market_feature(text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.search_listings(text, text, text, integer, integer) to service_role;
grant execute on function public.report_listing(text, text, integer) to service_role;
grant execute on function public.settle_market_feature(text, text, jsonb, integer) to service_role;
