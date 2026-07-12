-- Server-side product search/filter/sort + paging, for both the merchant's
-- inventory table and the public storefront grid.
--
-- Why an RPC and not `.range()` + `.ilike()` on the PostgREST table endpoint:
-- pagination is only *correct* if filtering happens on the server. The pages
-- filter by category/status/price and search by name — all client-side today,
-- over a list they'd fetched in full. Bolt .range() onto that and the filters
-- silently start applying to the current page only, which is a worse bug than
-- the slow query it replaces.
--
-- And doing it through the table endpoint would mean building a PostgREST
-- filter string from a user-typed search term:
--     .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
-- PostgREST's filter language treats , ( ) " as syntax, and supabase-js does
-- not escape them, so a term like `a,b)` breaks out of the expression. That is
-- a real injection surface — not SQL injection, but the same shape. Passing the
-- term as a bound function parameter removes it entirely. (% and _ still act as
-- LIKE wildcards inside the term; harmless, and it makes search a little
-- friendlier.)
--
-- security invoker: `products public read` is `using (true)`, so anon and the
-- owning merchant both work through the normal policy, and RLS stays the
-- backstop rather than being bypassed by a definer.

create or replace function search_products(
  p_merchant_id uuid,
  p_search      text default '',
  p_category    text default null,   -- null / 'All' = every category
  p_status      text default null,   -- null / 'all' | 'available' | 'low' | 'out' | 'in-stock'
  p_max_price   int  default null,
  p_sort        text default 'newest',  -- 'newest' | 'price-asc' | 'price-desc'
  p_limit       int  default 12,
  p_offset      int  default 0
)
returns table (
  id           uuid,
  merchant_id  uuid,
  name         text,
  sku          text,
  category     text,
  price_kes    integer,
  discount_pct integer,
  stock_qty    integer,
  status       stock_status,
  images       text[],
  sizes        text[],
  rating       numeric,
  review_count integer,
  description  text,
  created_at   timestamptz,
  shop_handle  text,
  total_count  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select least(greatest(coalesce(p_limit, 12), 1), 50) as lim,
           greatest(coalesce(p_offset, 0), 0)            as off
  ),
  q as (
    select nullif(btrim(coalesce(p_search, '')), '') as term
  ),
  -- Referenced twice (paged rows + total), so Postgres materialises this once
  -- and both the count and the page come out of a single scan.
  matched as (
    select pr.*
    from products pr, q
    where pr.merchant_id = p_merchant_id
      and (
        q.term is null
        or pr.name     ilike '%' || q.term || '%'
        or pr.sku      ilike '%' || q.term || '%'
        or pr.category ilike '%' || q.term || '%'
      )
      and (p_category is null or p_category = 'All' or pr.category = p_category)
      and (
        p_status is null or p_status = 'all'
        or (p_status = 'in-stock' and pr.status <> 'out')
        or (p_status in ('available', 'low', 'out') and pr.status = p_status::stock_status)
      )
      and (p_max_price is null or pr.price_kes <= p_max_price)
  )
  select
    m.id, m.merchant_id, m.name, m.sku, m.category,
    m.price_kes, m.discount_pct, m.stock_qty, m.status,
    m.images, m.sizes, m.rating, m.review_count,
    coalesce(m.description, ''), m.created_at,
    mer.handle,
    (select count(*) from matched)
  from matched m
  join merchants mer on mer.id = m.merchant_id
  order by
    case when p_sort = 'price-asc'  then m.price_kes end asc,
    case when p_sort = 'price-desc' then m.price_kes end desc,
    m.created_at desc,
    m.id
  limit  (select lim from bounds)
  offset (select off from bounds);
$$;

revoke execute on function search_products(uuid, text, text, text, int, text, int, int) from public;
grant  execute on function search_products(uuid, text, text, text, int, text, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The aggregates the filter UI itself needs, which by definition can't come
-- from a page of rows: the category pills, the price-slider ceiling, and the
-- inventory stat cards. One call instead of deriving them from a full fetch.
-- ---------------------------------------------------------------------------
create or replace function shop_facets(p_merchant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(distinct pr.category order by pr.category)
      from products pr where pr.merchant_id = p_merchant_id
    ), '[]'::jsonb),
    'priceCeiling', coalesce((
      select max(pr.price_kes) from products pr where pr.merchant_id = p_merchant_id
    ), 0),
    'total',     (select count(*) from products pr where pr.merchant_id = p_merchant_id),
    'available', (select count(*) from products pr where pr.merchant_id = p_merchant_id and pr.status = 'available'),
    'low',       (select count(*) from products pr where pr.merchant_id = p_merchant_id and pr.status = 'low'),
    'out',       (select count(*) from products pr where pr.merchant_id = p_merchant_id and pr.status = 'out')
  );
$$;

revoke execute on function shop_facets(uuid) from public;
grant  execute on function shop_facets(uuid) to anon, authenticated;

-- Category filtering now happens server-side, but always as
-- (merchant_id = X and category = Y) — which the (merchant_id, created_at)
-- index already drives. A standalone index on category alone was never usable
-- for that and pg_stat_user_indexes confirms it: 0 scans since the schema was
-- created. Drop it rather than keep paying for it on every product write.
drop index if exists products_category_idx;
