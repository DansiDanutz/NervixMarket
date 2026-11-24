-- Nervix Space: Maker Growth & Proof Loop migration (safe to run multiple times).
-- Adds domain verification (`verified_at`), idempotent Featured expiry reminders (`feature_reminder_for`),
-- and privacy-safe aggregated daily listing metrics (`listing_metrics`, zero PII / zero IP addresses).

alter table public.listings add column if not exists verified_at timestamptz;
alter table public.listings add column if not exists feature_reminder_for timestamptz;

create index if not exists listings_feature_reminder
  on public.listings (status, featured_until)
  where status = 'active' and featured_until is not null;

-- Keep private internal columns out of search_listings output (verified_at is public).
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
         coalesce((select jsonb_agg(to_jsonb(pg) - 'owner_email' - 'orders' - 'edit_token_hash' - 'ip_hash' - 'search' - 'paid_until' - 'feature_reminder_for'
                   order by coalesce(pg.featured_until > now(), false) desc, pg.created_at desc, pg.id desc) from pg), '[]'::jsonb)
    into v_total, v_items;
  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

create table if not exists public.listing_metrics (
  listing_id text not null references public.listings (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  views integer not null default 0 check (views >= 0),
  visit_clicks integer not null default 0 check (visit_clicks >= 0),
  pay_clicks integer not null default 0 check (pay_clicks >= 0),
  mcp_lookups integer not null default 0 check (mcp_lookups >= 0),
  badge_loads integer not null default 0 check (badge_loads >= 0),
  primary key (listing_id, day)
);

alter table public.listing_metrics enable row level security;

create or replace function public.record_listing_metric(p_listing_id text, p_kind text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  if p_listing_id is null or p_listing_id = '' then return; end if;
  if not exists (select 1 from public.listings where id = p_listing_id and status <> 'removed') then
    return;
  end if;
  if p_kind = 'views' then
    insert into public.listing_metrics (listing_id, day, views) values (p_listing_id, v_day, 1)
      on conflict (listing_id, day) do update set views = public.listing_metrics.views + 1;
  elsif p_kind = 'visit_clicks' then
    insert into public.listing_metrics (listing_id, day, visit_clicks) values (p_listing_id, v_day, 1)
      on conflict (listing_id, day) do update set visit_clicks = public.listing_metrics.visit_clicks + 1;
  elsif p_kind = 'pay_clicks' then
    insert into public.listing_metrics (listing_id, day, pay_clicks) values (p_listing_id, v_day, 1)
      on conflict (listing_id, day) do update set pay_clicks = public.listing_metrics.pay_clicks + 1;
  elsif p_kind = 'mcp_lookups' then
    insert into public.listing_metrics (listing_id, day, mcp_lookups) values (p_listing_id, v_day, 1)
      on conflict (listing_id, day) do update set mcp_lookups = public.listing_metrics.mcp_lookups + 1;
  elsif p_kind = 'badge_loads' then
    insert into public.listing_metrics (listing_id, day, badge_loads) values (p_listing_id, v_day, 1)
      on conflict (listing_id, day) do update set badge_loads = public.listing_metrics.badge_loads + 1;
  end if;
end;
$$;

create or replace function public.get_listing_metrics(p_listing_id text, p_days integer default 30)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_days integer := greatest(least(coalesce(p_days, 30), 365), 1);
  v_since date := (now() at time zone 'utc')::date - (v_days - 1);
  v_totals jsonb;
  v_recent jsonb;
begin
  select jsonb_build_object(
    'views', coalesce(sum(views), 0),
    'visit_clicks', coalesce(sum(visit_clicks), 0),
    'pay_clicks', coalesce(sum(pay_clicks), 0),
    'mcp_lookups', coalesce(sum(mcp_lookups), 0),
    'badge_loads', coalesce(sum(badge_loads), 0)
  ) into v_totals
  from public.listing_metrics
  where listing_id = p_listing_id;

  select jsonb_build_object(
    'views', coalesce(sum(views), 0),
    'visit_clicks', coalesce(sum(visit_clicks), 0),
    'pay_clicks', coalesce(sum(pay_clicks), 0),
    'mcp_lookups', coalesce(sum(mcp_lookups), 0),
    'badge_loads', coalesce(sum(badge_loads), 0)
  ) into v_recent
  from public.listing_metrics
  where listing_id = p_listing_id and day >= v_since;

  return jsonb_build_object(
    'window_days', v_days,
    'totals', v_totals,
    'recent', v_recent
  );
end;
$$;

revoke all on function public.search_listings(text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.record_listing_metric(text, text) from public, anon, authenticated;
revoke all on function public.get_listing_metrics(text, integer) from public, anon, authenticated;
grant execute on function public.search_listings(text, text, text, integer, integer) to service_role;
grant execute on function public.record_listing_metric(text, text) to service_role;
grant execute on function public.get_listing_metrics(text, integer) to service_role;
