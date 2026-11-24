-- Nervix Space: Genesis 200 launch cohort + automatic #201 paid listing activation (safe to run multiple times).
-- Assigns unique monotonic genesis_number (1..FREE_LISTING_CAP) atomically via transaction advisory lock,
-- backfills existing live listings after the 4 Founding projects, and adds atomic paid listing settlement.

alter table public.listings add column if not exists genesis_number integer;

create unique index if not exists listings_genesis_number_uidx
  on public.listings (genesis_number)
  where genesis_number is not null;

-- Backfill existing active listings that do not yet have a genesis_number (starting after the 4 Founding projects).
do $$
declare
  r record;
  next_n integer;
begin
  select greatest(4, coalesce(max(genesis_number), 4)) into next_n from public.listings;
  for r in
    select id from public.listings
    where status = 'active' and genesis_number is null
    order by created_at asc, id asc
  loop
    next_n := next_n + 1;
    if next_n <= 200 then
      update public.listings set genesis_number = next_n where id = r.id;
    end if;
  end loop;
end;
$$;

-- Atomically insert a listing, claiming a Genesis free slot when under p_free_cap or creating as 'pending' once full.
create or replace function public.create_market_listing(
  p_row jsonb,
  p_free_cap integer default 200,
  p_founding_count integer default 4
) returns public.listings
language plpgsql security invoker set search_path = '' as $$
declare
  v_cap integer := greatest(coalesce(p_free_cap, 200), 0);
  v_founding integer := greatest(coalesce(p_founding_count, 0), 0);
  v_claimed integer;
  v_next_num integer := null;
  v_status text := 'pending';
  v_out public.listings;
begin
  perform pg_advisory_xact_lock(hashtext('nervix_genesis_200'));

  select v_founding + count(*)::integer into v_claimed
  from public.listings
  where genesis_number is not null;

  if v_claimed < v_cap then
    select greatest(v_founding, coalesce(max(genesis_number), v_founding)) + 1 into v_next_num
    from public.listings;
    if v_next_num <= v_cap then
      v_status := 'active';
    else
      v_next_num := null;
      v_status := 'pending';
    end if;
  end if;

  insert into public.listings (
    id, slug, name, tagline, description, category, offer, price,
    website, contact, logo, owner_email, pay_link, pay_mode,
    featured_until, status, created_at, orders, edit_token_hash, ip_hash, genesis_number
  ) values (
    p_row->>'id',
    p_row->>'slug',
    p_row->>'name',
    p_row->>'tagline',
    coalesce(p_row->>'description', ''),
    p_row->>'category',
    p_row->>'offer',
    coalesce(p_row->>'price', ''),
    p_row->>'website',
    coalesce(p_row->>'contact', ''),
    coalesce(p_row->>'logo', ''),
    p_row->>'owner_email',
    coalesce(p_row->>'pay_link', ''),
    coalesce(p_row->>'pay_mode', ''),
    null,
    v_status,
    coalesce((p_row->>'created_at')::timestamptz, now()),
    '{}',
    p_row->>'edit_token_hash',
    p_row->>'ip_hash',
    v_next_num
  )
  returning * into v_out;

  return v_out;
end;
$$;

-- Count claimed Genesis DB slots (caller adds founding count).
create or replace function public.count_genesis_listings()
returns integer language sql stable security invoker set search_path = '' as $$
  select count(*)::integer from public.listings where genesis_number is not null;
$$;

-- Atomically settle a Standard paid listing (#201+): idempotent by order_id, activates pending listing.
create or replace function public.settle_market_listing(
  p_order_id text, p_listing_id text, p_detail jsonb
) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  current_status text;
  inserted_order text;
begin
  if p_order_id is null or p_order_id = '' then
    raise exception 'invalid listing payment';
  end if;
  select status into current_status from public.listings where id = p_listing_id for update;
  if not found then raise exception 'unknown listing'; end if;
  if current_status = 'removed' then raise exception 'removed listing'; end if;

  insert into public.membership_payments(order_id, listing_id, detail)
    values(p_order_id, p_listing_id, p_detail)
    on conflict(order_id) do nothing returning order_id into inserted_order;
  if inserted_order is null then return null; end if;

  update public.listings
    set status = case when status = 'pending' then 'active' else status end,
        orders = array_append(orders, p_order_id),
        updated_at = now()
    where id = p_listing_id
    returning status into current_status;

  return current_status;
end;
$$;

revoke all on function public.create_market_listing(jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.count_genesis_listings() from public, anon, authenticated;
revoke all on function public.settle_market_listing(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_market_listing(jsonb, integer, integer) to service_role;
grant execute on function public.count_genesis_listings() to service_role;
grant execute on function public.settle_market_listing(text, text, jsonb) to service_role;
