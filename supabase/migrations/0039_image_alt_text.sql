-- Per-photo alt text.
--
-- Every product photo currently reaches a crawler (and a screen reader) as
-- either the product name repeated N times or an empty string. Google Images is
-- a real entry point for "black nike air force 1 nairobi" style queries and alt
-- text is the only signal it has for a photo, so this gives the seller one short
-- description per image.
--
-- Stored as a PARALLEL ARRAY to `images`, not a jsonb map keyed by URL: the
-- gallery is ordered and the seller reorders/removes photos by position, so the
-- index is the stable identity here. A shorter array (or a null/empty slot)
-- simply means "no alt text for that photo" — the UI falls back to the product
-- name, exactly as it does today. That makes this additive: every existing row
-- reads as an empty array and renders unchanged.

alter table products
  add column if not exists image_alt text[] not null default '{}'::text[];

-- Shape guards, mirroring the images CHECKs in 0021: one alt per photo (8 is
-- the image cap) and a total length that leaves room for a useful sentence
-- each without turning the column into free storage. text_array_len() is the
-- same immutable helper 0021 uses — a CHECK cannot contain a subquery, so
-- per-element limits have to go through a function.
alter table products drop constraint if exists products_image_alt_n;
alter table products drop constraint if exists products_image_alt_len;
alter table products
  add constraint products_image_alt_n
    check (coalesce(array_length(image_alt, 1), 0) <= 8),
  add constraint products_image_alt_len
    check (text_array_len(image_alt) <= 1600);

-- ---------------------------------------------------------------------------
-- search_products: carry image_alt through.
--
-- Load-bearing for the SELLER, not the buyer grid: listProducts() feeds the
-- dashboard inventory list, and the product editor is opened from those rows.
-- Without image_alt on them the edit form would load with the alt text missing
-- and silently wipe it on the next save — the exact trap 0036 documented for
-- color_images.
--
-- Return type changes, so this is DROP + CREATE (create-or-replace cannot
-- change it), which resets the ACL to execute-to-public and makes the
-- revoke/grant at the bottom load-bearing rather than ceremony. Same trap as
-- 0026/0027/0028/0030/0036/0037/0038.
--
-- Body below is the LIVE 0038 body plus the one new output column. Nothing else
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
-- seo_product: hand the alt texts to the server renderer too.
--
-- api/render.ts is the only version of the page a crawler or a WhatsApp
-- link-preview fetcher ever sees, so `og:image:alt` has to be emitted there —
-- the client-side copy in lib/seo.ts would be too late for both. Return type is
-- unchanged (jsonb), so this is a plain create-or-replace and the grants stay.
-- Body is the LIVE 0028 body plus the one new key.
-- ---------------------------------------------------------------------------
create or replace function seo_product(p_handle text, p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'name',            p.name,
    'slug',            p.slug,
    'sku',             p.sku,
    'category',        p.category,
    'summary',         coalesce(p.summary, ''),
    'description',     coalesce(p.description, ''),
    'metaDescription', coalesce(p.meta_description, ''),
    'images',          to_jsonb(coalesce(p.images, '{}'::text[])),
    'imageAlts',       to_jsonb(coalesce(p.image_alt, '{}'::text[])),
    'minPrice',        effective_price(p.price_kes, p.discount_pct,
                         variant_min_adj(p.size_price_adj,  p.sizes)
                       + variant_min_adj(p.color_price_adj, p.colors)),
    'maxPrice',        effective_price(p.price_kes, p.discount_pct,
                         variant_max_adj(p.size_price_adj,  p.sizes)
                       + variant_max_adj(p.color_price_adj, p.colors)),
    'inStock',         (p.status <> 'out'),
    'updatedAt',       p.updated_at,
    'shopName',        m.name,
    'shopHandle',      m.handle,
    'shopLocation',    coalesce(m.location, '')
  )
  from products p
  join merchants m on m.id = p.merchant_id
  where m.handle = lower(btrim(p_handle))
    and p.slug   = lower(btrim(p_slug))
  limit 1;
$$;

revoke execute on function seo_product(text, text) from public;
grant  execute on function seo_product(text, text) to anon, authenticated;
