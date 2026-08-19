-- ---------------------------------------------------------------------------
-- 0050  Search relevance: the thing you searched for, first.
--
-- THE BUG THIS FIXES. search_products has matched on name, sku and category
-- since 0022, and then ordered the matches by created_at desc regardless. So
-- searching "Galaxy Z Fold7" put every product whose CATEGORY merely contains
-- the word above the product actually named that, as long as they were listed
-- more recently. On a phone, where the grid is two columns, the thing the
-- shopper typed could be most of a screen down. The match was never wrong; the
-- ordering was.
--
-- WHAT RANKS. Exact name, then exact SKU, then a name that starts with the
-- term, then a name that contains it, then SKU, then everything else (which in
-- practice is a category hit). Six tiers rather than a similarity score,
-- because the tiers are explainable — a shopper can see why a result is where
-- it is — and because pg_trgm is not installed and adding an extension to sort
-- a catalogue this size would be answering a question nobody asked.
--
-- WHEN IT APPLIES. Only when the shopper has not chosen a sort. Picking "Price:
-- Low to High" is an explicit instruction and relevance must not quietly
-- override it; with the default 'newest' there is no such instruction, so
-- relevance leads and created_at breaks the ties inside each tier.
--
-- Return type and signature are both unchanged -- the rank is computed in the
-- CTE and used only in ORDER BY -- so this is a plain create-or-replace and the
-- existing grants stand.
-- ---------------------------------------------------------------------------
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
  p_conditions  text[] default null,  -- null / empty = any phone condition
  p_min_price   int  default null     -- compared against the LOWEST variant price
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
  image_alt       text[],
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
  sold_30d        integer,
  total_count     bigint
)
language sql
stable
security invoker
set search_path = public
as $fn$
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
    select p.*,
           -- Every row in this CTE already matched; the tier says HOW well, and
           -- a flat 0 with no term keeps the un-searched grid ordered purely by
           -- the sort the caller asked for.
           case
             when q.term is null                                    then 0
             when lower(p.name) = lower(q.term)                     then 0
             when lower(p.sku)  = lower(q.term)                     then 1
             when lower(p.name) like lower(q.term) || '%'           then 2
             when lower(p.name) like '%' || lower(q.term) || '%'    then 3
             when lower(p.sku)  like '%' || lower(q.term) || '%'    then 4
             else 5
           end as match_rank
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
      and (p_min_price is null or p.eff_price >= p_min_price)
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
    m.images, coalesce(m.image_alt, '{}'::text[]),
    m.sizes, m.colors, m.size_price_adj, m.color_price_adj, m.color_images,
    m.product_type, m.specs,
    m.rating, m.review_count,
    m.summary, coalesce(m.description, ''), m.created_at,
    mer.handle,
    product_sold_30d(m.id),
    (select count(*) from matched)
  from matched m
  join merchants mer on mer.id = m.merchant_id
  order by
    case when p_sort = 'price-asc'  then m.eff_price end asc,
    case when p_sort = 'price-desc' then m.eff_price end desc,
    -- Relevance only where the shopper expressed no preference. An explicit
    -- price sort is an instruction; 'newest' is just the default.
    case when coalesce(p_sort, 'newest') not in ('price-asc', 'price-desc')
         then m.match_rank end asc,
    m.created_at desc,
    m.id
  limit  (select lim from bounds)
  offset (select off from bounds);
$fn$;

revoke execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int) from public;
grant  execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int) to anon, authenticated;
