-- ---------------------------------------------------------------------------
-- 0044  "N+ bought in past month" on the product tile.
--
-- The number is computable from order_items, but not by the buyer: that table is
-- RLS-locked to the owning merchant and to a customer holding the order's access
-- key (0001, tightened by 0015 and 0018), and search_products is SECURITY
-- INVOKER. A join added straight into it would return 0 for every shopper, so
-- the only person who would ever see a count is the seller looking at their own
-- dashboard.
--
-- The aggregate therefore goes in its own SECURITY DEFINER function, which
-- search_products calls. This is a deliberate disclosure: it makes per-product
-- 30-day sales volume public for every product in every shop. That IS the
-- feature — it is the social proof the badge is made of — but it does mean a
-- competitor can read which of a shop's products move. Nothing else leaks: the
-- function returns one integer and never exposes an order, a customer or a
-- price.
-- ---------------------------------------------------------------------------

-- Units of one product ordered in the last 30 days.
--
-- Counts qty, not orders: someone buying three of a thing bought three.
--
-- Excludes only 'failed' rather than counting just 'paid', because most orders
-- here are placed over WhatsApp/Instagram and settled off-platform, so their
-- payment_status legitimately stays 'idle' or 'pending' forever. Counting only
-- 'paid' would report ~0 for exactly the shops doing the most business.
--
-- Reads order_items by product_id (order_items_product_idx, added in 0015) and
-- then hits orders by primary key, so it is two index lookups per product. Being
-- SECURITY DEFINER it is NOT inlined into the caller and so runs once per row;
-- that is affordable at a page size capped at 50, and is the price of not
-- opening up order_items itself.
create or replace function product_sold_30d(p_product_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(oi.qty), 0)::integer
  from order_items oi
  join orders o on o.id = oi.order_id
  where oi.product_id = p_product_id
    and o.placed_at >= now() - interval '30 days'
    and o.payment_status <> 'failed';
$$;

revoke all on function product_sold_30d(uuid) from public;
grant execute on function product_sold_30d(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_products: carry sold_30d through.
--
-- Return type changes, so this is DROP + CREATE (create-or-replace cannot change
-- it), which resets the ACL to execute-to-public and makes the revoke/grant at
-- the bottom load-bearing rather than ceremony. Same trap as
-- 0026/0027/0028/0030/0036/0037/0038/0039.
--
-- Body below is the LIVE 0039 body plus the one new output column. Nothing else
-- changes: same 15 parameters, same filters, same ordering.
-- ---------------------------------------------------------------------------
drop function if exists search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[]);

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
    m.created_at desc,
    m.id
  limit  (select lim from bounds)
  offset (select off from bounds);
$$;

revoke execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[]) from public;
grant  execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[]) to anon, authenticated;
