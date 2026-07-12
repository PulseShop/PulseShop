-- Move the analytics dashboard's aggregation server-side.
--
-- AnalyticsPage was calling listOrders() + listProducts() — every order the
-- merchant has ever received, with every line item, plus the whole catalogue —
-- and then reducing it all in the browser to produce ~20 numbers. That payload
-- grows forever and is the single heaviest read in the app. This does the same
-- maths in one query and returns just the result.
--
-- security invoker, not definer: `orders owner read` / `order_items owner read`
-- RLS already scope rows to the calling merchant, so invoker means this
-- function physically cannot read another merchant's sales. The explicit
-- merchant_id = auth.uid() filters are belt-and-braces on top of that.
--
-- Returns a camelCase jsonb view-model (not a table row) — it exists to feed
-- one screen, so the adapter is a thin cast rather than a mapper.
--
-- p_tz is an IANA zone from the browser. The old client-side code bucketed
-- revenue by *local* calendar day (toLocaleDateString("en-CA")); bucketing in
-- UTC instead would shift every Kenyan sale before 03:00 into the wrong day.

create or replace function merchant_analytics(p_days int default 7, p_tz text default 'UTC')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with args as (
    select least(greatest(coalesce(p_days, 7), 1), 90) as days,
           -- An unknown zone would raise; fall back to UTC instead of erroring
           -- the whole dashboard.
           case when exists (select 1 from pg_timezone_names z where z.name = p_tz)
                then p_tz else 'UTC' end as tz
  ),
  uid as (select auth.uid() as id),
  o as (
    select ord.*
    from orders ord
    where ord.merchant_id = (select id from uid)
  ),
  paid as (select * from o where payment_status = 'paid'),
  totals as (
    select
      coalesce((select sum(total_kes) from paid), 0)::bigint as revenue,
      (select count(*) from paid)                            as paid_count,
      (select count(*) from o)                               as order_count,
      (select count(*) from o where payment_status = 'pending') as pending_count
  ),
  top_products as (
    select
      oi.product_name                                              as name,
      sum(oi.qty)::int                                             as units,
      sum(oi.line_total_kes)::int                                  as revenue,
      (array_agg(oi.image order by ord.placed_at desc))[1]         as image
    from order_items oi
    join o ord on ord.id = oi.order_id
    group by oi.product_name
    order by units desc, revenue desc
    limit 5
  ),
  day_series as (
    select d::date as day
    from args,
         generate_series(
           (timezone(args.tz, now()))::date - (args.days - 1),
           (timezone(args.tz, now()))::date,
           interval '1 day'
         ) d
  ),
  daily as (
    select
      ds.day,
      coalesce(sum(p.total_kes), 0)::bigint as total
    from day_series ds
    left join paid p
      on (timezone((select tz from args), p.placed_at))::date = ds.day
    group by ds.day
  ),
  low as (
    select pr.id, pr.name, pr.stock_qty, pr.status
    from products pr
    where pr.merchant_id = (select id from uid)
      and pr.status <> 'available'
    order by pr.stock_qty asc, pr.name
    limit 8
  )
  select jsonb_build_object(
    'revenue',      (select revenue from totals),
    'aov',          (select case when paid_count > 0
                                 then round(revenue::numeric / paid_count)::bigint
                                 else 0 end
                     from totals),
    'orderCount',   (select order_count   from totals),
    'paidCount',    (select paid_count    from totals),
    'pendingCount', (select pending_count from totals),
    'topProducts',  coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', name, 'units', units, 'revenue', revenue, 'image', coalesce(image, '')
      ) order by units desc, revenue desc)
      from top_products
    ), '[]'::jsonb),
    'channels', jsonb_build_object(
      'whatsapp',  (select count(*) from o where channel = 'whatsapp'),
      'instagram', (select count(*) from o where channel = 'instagram'),
      'facebook',  (select count(*) from o where channel = 'facebook'),
      'direct',    (select count(*) from o where channel = 'direct')
    ),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('date', day, 'total', total) order by day)
      from daily
    ), '[]'::jsonb),
    'lowStock', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'stockQty', stock_qty, 'status', status
      ) order by stock_qty asc)
      from low
    ), '[]'::jsonb),
    'lowStockCount', (
      select count(*) from products
      where merchant_id = (select id from uid) and status <> 'available'
    )
  );
$$;

-- Signed-in merchants only — there is nothing here for anon, and invoker RLS
-- would return an empty shell anyway.
revoke execute on function merchant_analytics(int, text) from public, anon;
grant  execute on function merchant_analytics(int, text) to authenticated;
