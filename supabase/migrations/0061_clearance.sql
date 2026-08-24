-- ---------------------------------------------------------------------------
-- 0061  Clearance: stock the seller wants gone, on its own shelf.
--
-- WHY A FLAG AND NOT "A BIG DISCOUNT". The obvious version defines clearance as
-- discount_pct above some threshold and needs no column at all. It is wrong on
-- both sides. A shop running 50% off a new arrival to launch it is not clearing
-- anything, and a shop dumping the last four of a discontinued line at full
-- price very much is. Clearance is a statement of INTENT about stock, which is
-- a fact only the seller holds; discount_pct is a price. Deriving one from the
-- other would put products on the shelf that the seller never meant to clear
-- and keep off the ones they did.
--
-- So this is deliberately a separate axis from discount_pct, the same way
-- status is a separate axis from stock_qty. A product can be on clearance, on
-- discount, both, or neither, and the two shelves (list_deals, 0058) overlap
-- freely — a marked-down clearance item legitimately belongs on both.
--
-- ORDERED BY SAVING, WITH UNMARKED STOCK LAST. `nulls last` is load-bearing:
-- clearance does not require a markdown, so a shelf ordered on discount_pct
-- alone would put the full-price clearance items at the top on Postgres's
-- default `nulls first` for DESC. The shopper opening a shelf called Clearance
-- is looking for the biggest cut, so the biggest cut leads and the unmarked
-- stock sits behind it rather than in front.
--
-- ELIGIBILITY MATCHES THE DEALS SHELF AND THE WALL: closing shops, out-of-stock
-- products and products with no photograph are excluded. Clearance is the one
-- shelf where "out of stock" is most likely — it is the last few of a line —
-- so the status filter matters more here than anywhere else.
--
-- SECURITY INVOKER: products and merchants are publicly readable already, so
-- this needs no elevated rights and RLS stays the boundary. The WRITE side
-- needs no new policy either: sellers already update their own products
-- through the existing owner policy on the table, and this is one more column
-- on rows they can already write.
-- ---------------------------------------------------------------------------

alter table products
  add column if not exists clearance boolean not null default false;

comment on column products.clearance is
  'Seller-set: this stock is being cleared. Independent of discount_pct — see migration 0061.';

create or replace function list_clearance(p_limit int default 24)
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
  clearance       boolean,
  shop_handle     text,
  shop_name       text
)
language sql
stable
security invoker
set search_path = public
as $fn$
  select
    p.id, p.merchant_id, p.name, p.slug, p.sku, p.category,
    p.price_kes, p.discount_pct, p.stock_qty, p.status,
    p.images, coalesce(p.image_alt, '{}'::text[]),
    p.sizes, p.colors, p.size_price_adj, p.color_price_adj, p.color_images,
    p.product_type, p.specs, p.rating, p.review_count,
    p.summary, coalesce(p.description, ''), p.created_at,
    p.clearance,
    m.handle, m.name
  from products p
  join merchants m on m.id = p.merchant_id
  where m.shop_status <> 'closing'
    and p.status <> 'out'
    and p.clearance
    and coalesce(array_length(p.images, 1), 0) > 0
  order by p.discount_pct desc nulls last, p.price_kes desc, p.created_at desc
  -- Capped, because this is a shelf and not a catalogue — same reasoning as
  -- list_deals (0058).
  limit least(greatest(coalesce(p_limit, 24), 1), 60);
$fn$;

-- Partial on the flag itself: clearance is a small minority of any catalogue,
-- so the index only carries the rows the shelf can actually return. The sort
-- keys ride along so the ordering above is read straight off the index.
create index if not exists products_clearance_idx
  on products (discount_pct desc nulls last, price_kes desc)
  where clearance;

revoke execute on function list_clearance(int) from public;
grant  execute on function list_clearance(int) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- search_products, carrying the clearance flag.
--
-- The seller's inventory table is the one screen that has to SHOW the current
-- state of the flag next to the control that toggles it, and it is fed by
-- search_products — so the column has to come back from this read or the
-- toggle has nothing to render. A `create or replace` cannot widen a function's
-- return type, so this drops and recreates, exactly as 0060 did when it added
-- `brand`. The argument list is unchanged; only the returned row grew.
--
-- The body below is 0060's verbatim, with `clearance` added in two places (the
-- returns table and the select list) and nothing else touched. Buyers get the
-- column too, which costs one boolean per row and saves a second round trip
-- the day a product tile wants to show a Clearance badge.
-- ---------------------------------------------------------------------------
drop function if exists search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int, text[], text[]);

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
  p_min_price   int  default null,    -- compared against the LOWEST variant price
  p_categories  text[] default null,  -- null / empty = any category; else any leaf in the list
  p_brands      text[] default null   -- null / empty = any brand; else any name in the list
)
returns table (
  id              uuid,
  merchant_id     uuid,
  name            text,
  slug            text,
  sku             text,
  category        text,
  brand           text,
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
  clearance       boolean,
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
      -- The set form of the line above (0059). AND, not OR: a caller sending
      -- both is asking for what satisfies both, and in practice only one of the
      -- two is ever set.
      and (
        coalesce(array_length(p_categories, 1), 0) = 0
        or p.category = any (p_categories)
      )
      -- Brand (0060). `p.brand = any (...)` is already false for a null brand,
      -- so an unbranded product drops out of a brand-filtered result without
      -- needing to say so.
      and (
        coalesce(array_length(p_brands, 1), 0) = 0
        or p.brand = any (p_brands)
      )
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
    m.id, m.merchant_id, m.name, m.slug, m.sku, m.category, m.brand,
    m.price_kes, m.discount_pct, m.stock_qty, m.status,
    m.images, coalesce(m.image_alt, '{}'::text[]),
    m.sizes, m.colors, m.size_price_adj, m.color_price_adj, m.color_images,
    m.product_type, m.specs,
    m.rating, m.review_count,
    m.summary, coalesce(m.description, ''), m.created_at,
    m.clearance,
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

-- Restated because the DROP above took the old function's privileges with it.
-- Signature is byte-identical to 0060's; only the return type moved.
revoke execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int, text[], text[]) from public;
grant  execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int, text[], text[]) to anon, authenticated;
