-- Nervix Space: production hardening migration (safe to run multiple times).
-- Adds deterministic id tie-breaker to search_listings so pagination across equal created_at timestamps never skips or duplicates rows,
-- and prevents featuring listings that were already removed by their owner.

create or replace function public.search_listings(p_q text, p_category text, p_offer text, p_limit integer, p_offset integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_words text := btrim(regexp_replace(lower(left(coalesce(p_q, ''), 100)), '[^[:alnum:]]+', ' ', 'g'));
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
    order by coalesce(m.featured_until > now(), false) desc, m.created_at desc, m.id desc
    limit greatest(least(coalesce(p_limit, 36), 5000), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select (select count(*) from m),
         coalesce((select jsonb_agg(to_jsonb(pg) - 'owner_email' - 'orders' - 'edit_token_hash' - 'ip_hash' - 'search' - 'paid_until'
                   order by coalesce(pg.featured_until > now(), false) desc, pg.created_at desc, pg.id desc) from pg), '[]'::jsonb)
    into v_total, v_items;
  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

create or replace function public.settle_market_feature(
  p_order_id text, p_listing_id text, p_detail jsonb, p_days integer
) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare
  current_until timestamptz;
  current_status text;
  next_until timestamptz;
  inserted_order text;
begin
  if p_order_id is null or p_order_id = '' or p_days is null or p_days < 1 or p_days > 3660 then
    raise exception 'invalid feature payment';
  end if;
  select featured_until, status into current_until, current_status from public.listings where id = p_listing_id for update;
  if not found then raise exception 'unknown listing'; end if;
  if current_status = 'removed' then raise exception 'removed listing'; end if;
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
revoke all on function public.settle_market_feature(text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.search_listings(text, text, text, integer, integer) to service_role;
grant execute on function public.settle_market_feature(text, text, jsonb, integer) to service_role;
