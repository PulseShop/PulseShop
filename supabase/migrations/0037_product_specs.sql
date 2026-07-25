-- Structured attributes for two high-variance categories (phones, PCs), on
-- top of the free-text `category` merchandising label. A seller explicitly
-- marks a listing's TYPE (product_type) rather than this being inferred from
-- `category` text — matching on free text would be fragile (case, plurals, a
-- seller's own wording for the category chip) — and product_type is what
-- turns on the structured spec form. Every existing product defaults to
-- 'general' and is completely unaffected.
--
-- Specs live in one flexible `specs` jsonb column rather than dozens of
-- category-specific columns, following the size_price_adj/color_price_adj
-- (0027) and color_images (0036) convention — including its own "escape
-- hatch": every spec shape carries a free-text customNotes field for
-- whatever the structured fields don't cover (a modded case, custom cooling,
-- a repair history), same idea as those two jsonb maps.
--
-- ram_gb/storage_gb are pulled out as GENERATED columns because they're the
-- two fields buyers actually want SLIDERS on ("at least 16GB under $1000") —
-- a range query (>=) can't use a GIN index over the whole jsonb blob, but a
-- plain integer column can use a normal btree one. Every other spec (brand,
-- condition, network lock, form factor...) is an equality/containment
-- lookup, which GIN on `specs` serves directly, so it doesn't need its own
-- column.

create type product_type as enum ('general', 'phone', 'pc');

alter table products
  add column if not exists product_type product_type not null default 'general',
  add column if not exists specs        jsonb not null default '{}'::jsonb;

-- Shape guard, same pattern as jsonb_int_map_ok/jsonb_text_map_ok (0027/0036):
-- caps how much a single product can stuff into specs. This is a size
-- backstop, not a schema validator — which fields specs should actually
-- contain for a phone vs a PC is enforced app-side by the two spec forms,
-- the same division of labour sizes/colors already use.
create or replace function jsonb_specs_ok(p_specs jsonb) returns boolean
language sql immutable
set search_path = public
as $$
  select p_specs is null or (
    jsonb_typeof(p_specs) = 'object'
    and (select count(*) from jsonb_object_keys(p_specs)) <= 30
    and octet_length(p_specs::text) <= 4096
  );
$$;

alter table products drop constraint if exists products_specs_ok;
alter table products
  add constraint products_specs_ok check (jsonb_specs_ok(specs));

alter table products
  add column if not exists ram_gb     int generated always as (nullif(specs->>'ramGb','')::int) stored,
  add column if not exists storage_gb int generated always as (nullif(specs->>'storageGb','')::int) stored;

create index if not exists products_specs_gin_idx  on products using gin (specs);
create index if not exists products_type_idx       on products (product_type);
create index if not exists products_ram_gb_idx     on products (ram_gb)     where product_type in ('phone', 'pc');
create index if not exists products_storage_gb_idx on products (storage_gb) where product_type in ('phone', 'pc');

-- ---------------------------------------------------------------------------
-- search_products: carry product_type + specs through so the merchant's own
-- product list (InventoryPage, via listProducts) and the public storefront
-- grid both have them — without this, reopening a Phone/PC listing to edit it
-- would load with the specs missing and silently wipe them on the next save
-- (the same trap 0036 documents for color_images).
--
-- Return type changes, so this must be DROP + CREATE (create-or-replace
-- cannot change it) — which resets the ACL to execute-to-public, making the
-- revoke/grant at the bottom load-bearing, not ceremony. Same trap as
-- 0026/0027/0028/0030/0036.
--
-- The body below is the LIVE 0036 body (its own comment says verified via
-- pg_get_functiondef, not reconstructed from an older migration) plus
-- product_type/specs — for the same reason 0036 gives: rebuilding it from an
-- earlier migration's text would silently revert everything added since.
-- ---------------------------------------------------------------------------
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
  p_min_rating  numeric default null  -- null = no rating constraint
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

revoke execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric) from public;
grant  execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric) to anon, authenticated;
