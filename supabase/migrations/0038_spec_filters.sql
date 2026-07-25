-- Buyer-facing filters for the structured Phone/PC specs added in 0037. The
-- storefront can now narrow by product type, minimum RAM, minimum storage and
-- phone condition — the "at least 16GB RAM" query the whole hybrid-spec model
-- exists to make possible. RAM/storage ranges hit the generated ram_gb /
-- storage_gb columns (and their partial btree indexes from 0037); type and
-- condition are equality lookups the GIN index / product_type index cover.
--
-- search_products gains four params, so its ARITY changes (11 -> 15) — that's
-- a DROP + CREATE, which resets the ACL to execute-to-public, making the
-- revoke/grant at the bottom load-bearing, not ceremony (same trap as
-- 0026/0027/0028/0030/0036/0037). Apply wrapped in begin;…commit; so the
-- storefront search is never briefly missing between the drop and create.
--
-- The four new params all default to null/empty, so the already-deployed
-- frontend (which calls this RPC with the old 11 named args) keeps working
-- unchanged — the new filters are simply not applied until the new client
-- sends them.
--
-- Body below is the LIVE 0037 body plus the four filters; per the standing
-- lesson, it was taken from 0037 (verified applied), not rebuilt from an older
-- migration that would silently revert slug/shop_status/rating handling.

drop function if exists search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric);

create or replace function search_products(
  p_merchant_id uuid default null,   -- null = every shop (universal search)
  p_search      text default '',
  p_category    text default null,   -- null / 'All' = every category
  p_status      text default null,   -- null / 'all' | 'available' | 'low' | 'out' | 'in-stock'
  p_max_price   int  default null,   -- compared against the LOWEST variant price
  p_sort        text default 'newest',  -- 'newest' | 'price-asc' | 'price-desc'
  p_limit       int  default 12,
  p_offset      int  default 0,
  p_sizes       text[] default null,  -- null / empty = any size
  p_colors      text[] default null,  -- null / empty = any colour
  p_min_rating  numeric default null, -- null = no rating constraint
  p_product_type text default null,   -- null = any type; 'phone' | 'pc' to narrow
  p_ram_min     int  default null,    -- null = any; else ram_gb >= this
  p_storage_min int  default null,    -- null = any; else storage_gb >= this
  p_conditions  text[] default null   -- null / empty = any phone condition
)
returns table (
  id              uuid,
  merchant_id     uuid,
  name            text,
  slug            text,
  sku             text,
  category        text,
  price_kes       integer,
  discount_pct    integer,
  stock_qty       integer,
  status          stock_status,
  images          text[],
  sizes           text[],
  colors          text[],
  size_price_adj  jsonb,
  color_price_adj jsonb,
  color_images    jsonb,
  product_type    product_type,
  specs           jsonb,
  rating          numeric,
  review_count    integer,
  summary         text,
  description     text,
  created_at      timestamptz,
  shop_handle     text,
  total_count     bigint
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
  priced as (
    select pr.*,
           effective_price(
             pr.price_kes,
             pr.discount_pct,
             variant_min_adj(pr.size_price_adj,  pr.sizes)
           + variant_min_adj(pr.color_price_adj, pr.colors)
           ) as eff_price
    from products pr
    where (p_merchant_id is null or pr.merchant_id = p_merchant_id)
      and exists (
        select 1 from merchants mm
        where mm.id = pr.merchant_id and mm.shop_status <> 'closing'
      )
  ),
  matched as (
    select p.*
    from priced p, q
    where (
        q.term is null
        or p.name     ilike '%' || q.term || '%'
        or p.sku      ilike '%' || q.term || '%'
        or p.category ilike '%' || q.term || '%'
      )
      and (p_category is null or p_category = 'All' or p.category = p_category)
      and (
        p_status is null or p_status = 'all'
        or (p_status = 'in-stock' and p.status <> 'out')
        or (p_status in ('available', 'low', 'out') and p.status = p_status::stock_status)
      )
      and (p_max_price is null or p.eff_price <= p_max_price)
      and (coalesce(array_length(p_sizes,  1), 0) = 0 or p.sizes  && p_sizes)
      and (coalesce(array_length(p_colors, 1), 0) = 0 or p.colors && p_colors)
      and (p_min_rating is null or p.rating >= p_min_rating)
      -- structured Phone/PC spec filters (0038)
      and (p_product_type is null or p.product_type = p_product_type::product_type)
      and (p_ram_min is null or (p.ram_gb is not null and p.ram_gb >= p_ram_min))
      and (p_storage_min is null or (p.storage_gb is not null and p.storage_gb >= p_storage_min))
      and (
        coalesce(array_length(p_conditions, 1), 0) = 0
        or (p.specs->>'condition') = any (p_conditions)
      )
  )
  select
    m.id, m.merchant_id, m.name, m.slug, m.sku, m.category,
    m.price_kes, m.discount_pct, m.stock_qty, m.status,
    m.images, m.sizes, m.colors, m.size_price_adj, m.color_price_adj, m.color_images,
    m.product_type, m.specs,
    m.rating, m.review_count,
    m.summary, coalesce(m.description, ''), m.created_at,
    mer.handle,
    (select count(*) from matched)
  from matched m
  join merchants mer on mer.id = m.merchant_id
  order by
    case when p_sort = 'price-asc'  then m.eff_price end asc,
    case when p_sort = 'price-desc' then m.eff_price end desc,
    m.created_at desc,
    m.id
  limit  (select lim from bounds)
  offset (select off from bounds);
$$;

revoke execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[]) from public;
grant  execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- shop_facets: surface which spec filters a shop can actually offer, so the
-- storefront only shows a RAM/storage/condition control when there is
-- something to match. Return type is unchanged (still jsonb), so this is a
-- plain create-or-replace — no drop, grants preserved. Body is the LIVE 0022
-- body plus the four new keys.
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
    'sizes', coalesce((
      select jsonb_agg(distinct s order by s)
      from products pr, unnest(pr.sizes) as s
      where pr.merchant_id = p_merchant_id
    ), '[]'::jsonb),
    'colors', coalesce((
      select jsonb_agg(distinct c order by c)
      from products pr, unnest(pr.colors) as c
      where pr.merchant_id = p_merchant_id
    ), '[]'::jsonb),
    -- Which structured types this shop stocks (phone/pc), so the UI knows
    -- whether to show the type filter at all. 'general' is excluded — it has
    -- no specs to filter on.
    'productTypes', coalesce((
      select jsonb_agg(distinct pr.product_type::text order by pr.product_type::text)
      from products pr
      where pr.merchant_id = p_merchant_id and pr.product_type <> 'general'
    ), '[]'::jsonb),
    'ram', coalesce((
      select jsonb_agg(distinct pr.ram_gb order by pr.ram_gb)
      from products pr
      where pr.merchant_id = p_merchant_id and pr.ram_gb is not null
    ), '[]'::jsonb),
    'storage', coalesce((
      select jsonb_agg(distinct pr.storage_gb order by pr.storage_gb)
      from products pr
      where pr.merchant_id = p_merchant_id and pr.storage_gb is not null
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(distinct pr.specs->>'condition' order by pr.specs->>'condition')
      from products pr
      where pr.merchant_id = p_merchant_id
        and pr.product_type = 'phone' and pr.specs ? 'condition'
    ), '[]'::jsonb),
    'priceCeiling', coalesce((
      select max(effective_price(
               pr.price_kes, pr.discount_pct,
               variant_min_adj(pr.size_price_adj,  pr.sizes)
             + variant_min_adj(pr.color_price_adj, pr.colors)))
      from products pr where pr.merchant_id = p_merchant_id
    ), 0),
    'total',     (select count(*) from products pr where pr.merchant_id = p_merchant_id),
    'available', (select count(*) from products pr where pr.merchant_id = p_merchant_id and pr.status = 'available'),
    'low',       (select count(*) from products pr where pr.merchant_id = p_merchant_id and pr.status = 'low'),
    'out',       (select count(*) from products pr where pr.merchant_id = p_merchant_id and pr.status = 'out')
  );
$$;

revoke execute on function shop_facets(uuid) from public;
grant  execute on function shop_facets(uuid) to anon, authenticated;
