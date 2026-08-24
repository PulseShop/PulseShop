-- ---------------------------------------------------------------------------
-- 0060  Products get a brand, and shoppers get to filter by it.
--
-- WHAT WAS MISSING. `products` has never carried a brand. The only one in the
-- schema lives inside the `specs` jsonb, on phone listings only (0037), which
-- makes it a fact about a spec sheet rather than a fact about a product: it is
-- unindexable without a functional index per key, it does not exist on the
-- laptop or the television or the pair of headphones next to it, and nothing
-- outside the phone spec table can read it. A shopper asking for HP is asking
-- across the whole catalogue, and there was nothing to ask.
--
-- WHY A COLUMN AND NOT A TABLE. A brands table with a foreign key would make
-- "which brands exist" a closed set, and a closed set is exactly what this
-- cannot be. Sellers here stock things no list has heard of, whether local labels,
-- imported off-brands or their own name, and the alternative to accepting that
-- is a seller either picking the wrong brand or leaving the field empty, which
-- is worse data than the free text. The aggregation problem a foreign key would
-- have solved ("hp" vs "HP" vs " Hp ") is solved in normalizeBrand() in
-- frontend/src/lib/brands.ts, which every write path runs through, exactly as
-- the size and colour vocabularies are enforced client-side over free text
-- columns (0026).
--
-- NULLABLE, AND MOST ROWS WILL STAY NULL. Brand is a meaningful fact about a
-- laptop and a meaningless one about a bag of sukuma wiki, so it is never
-- required and every existing row reads as "not stated". That makes this
-- additive: nothing is backfilled, nothing changes behaviour until a seller
-- fills it in.
--
-- PHONE LISTINGS: THE COLUMN IS AUTHORITATIVE, THE SPEC MIRRORS IT. specs->>
-- 'brand' stays where it is; it is what the product page prints beside the
-- model, but the seller now types the brand once, into the product-level
-- field, and the form copies it into the spec on save. Deliberately NOT
-- backfilled from specs here: the two are only guaranteed equal from the next
-- save onwards, the form seeds its field from the spec when the column is null,
-- and a bulk UPDATE over every phone in the catalogue to set a column nothing
-- reads yet is a write with no reader. Where a shop has never re-saved, the
-- product simply has no brand, which is the same state every other product on
-- the platform is in today.
-- ---------------------------------------------------------------------------

alter table products
  add column if not exists brand text;

-- Length guard, mirroring the per-field CHECKs in 0021. Forty characters: the
-- longest name in the featured list ("Western Digital") is fifteen, and past
-- forty this is not a brand, it is a description that will read badly as a
-- filter chip. Blank is normalised to NULL by the client, and the CHECK refuses
-- to store the difference so the facet below cannot grow an empty-string entry.
alter table products drop constraint if exists products_brand_len;
alter table products
  add constraint products_brand_len
    check (brand is null or (btrim(brand) = brand and char_length(brand) between 1 and 40));

-- Partial, because most of the table is null and an index over those rows would
-- be storage for a value no query asks about. Both readers below (the `= any`
-- filter in search_products and the distinct aggregate in shop_facets) only
-- ever touch rows where brand is not null.
create index if not exists products_brand_idx on products (brand) where brand is not null;

-- ---------------------------------------------------------------------------
-- search_products: filter by brand, and carry it on the row.
--
-- p_brands text[] is an ANY-OF, matching p_sizes/p_colors/p_categories and for
-- the same reason: a shopper ticking HP and Lenovo wants either, not a product
-- somehow made by both. A product with no brand never matches a set filter,
-- which is the only honest reading: "we do not know who made it" is not HP.
--
-- Appended at the END of the parameter list rather than slotted in beside
-- p_category where it reads better. PostgREST calls by name so the position is
-- invisible to the client, and appending keeps the DROP below matching the live
-- 0059 signature exactly. That matters, because getting that list wrong
-- leaves two overloads behind and PostgREST then refuses to pick one. Same trap
-- 0026/0027/0028/0030/0036/0037/0038/0039/0044/0048/0059 all flagged.
--
-- The return type gains `brand`, so this is DROP + CREATE (create-or-replace
-- cannot change it), which resets the ACL to execute-to-public and makes the
-- revoke/grant at the bottom load-bearing rather than ceremony.
--
-- Body is the live 0059 body plus one predicate and one output column. The
-- relevance tiers, the price range, the variant filters and the spec filters
-- are all carried over verbatim. `brand` is NOT added to the free-text search
-- predicate: the term already matches name, sku and category, seller names
-- routinely contain the brand ("HP EliteBook 840"), and widening the ilike to a
-- fourth column would make an unrelated search for "apple" surface every
-- accessory a shop happens to file under Apple.
-- ---------------------------------------------------------------------------
drop function if exists search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int, text[]);

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

revoke execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int, text[], text[]) from public;
grant  execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int, text[], text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- shop_facets: which brands are in stock, and a way to ask that per category.
--
-- The brand filter's one hard requirement is that a chip must never lead to an
-- empty grid, which is why the options come from here rather than from the
-- featured table in lib/brands.ts: that table is what the platform hopes to
-- carry, this is what it has.
--
-- p_categories narrows the BRANDS key AND NOTHING ELSE. The brand row sits
-- directly under the category ribbon, so the two have to agree: with Footwear
-- selected, HP must not be on offer. Everything else stays catalogue-wide on
-- purpose: 'categories' is what BUILDS that ribbon and narrowing it would have
-- the tree collapse to whatever the shopper already picked, and priceFloor /
-- priceCeiling are the two ends of a slider that must not move under the
-- shopper's thumb every time a chip is tapped.
--
-- Return type is unchanged (jsonb). A new parameter WITH A DEFAULT does change
-- the signature, so the revoke/grant is restated for the new one; PostgREST
-- resolves by argument names, so a caller that sends only p_merchant_id still
-- lands here and the old one-argument form is dropped below to avoid leaving an
-- ambiguous overload behind.
-- ---------------------------------------------------------------------------
drop function if exists shop_facets(uuid);

create or replace function shop_facets(
  p_merchant_id uuid default null,
  p_categories  text[] default null  -- null / empty = every category
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select pr.*
    from products pr
    where (p_merchant_id is null or pr.merchant_id = p_merchant_id)
      and (
        p_merchant_id is not null
        or exists (
          select 1 from merchants mm
          where mm.id = pr.merchant_id and mm.shop_status <> 'closing'
        )
      )
  ),
  -- The only CTE the category argument touches. See the header note.
  branded as (
    select pr.brand
    from scoped pr
    where pr.brand is not null
      and (
        coalesce(array_length(p_categories, 1), 0) = 0
        or pr.category = any (p_categories)
      )
  ),
  eff as (
    select effective_price(
             pr.price_kes, pr.discount_pct,
             variant_min_adj(pr.size_price_adj,  pr.sizes)
           + variant_min_adj(pr.color_price_adj, pr.colors)
           ) as price
    from scoped pr
  )
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(distinct pr.category order by pr.category) from scoped pr
    ), '[]'::jsonb),
    -- Alphabetical, like every other facet here. The merchandising order the
    -- buyer sees is applied client-side by orderBrands(), because it comes from
    -- a table that gets re-cut as the catalogue grows and does not belong
    -- frozen into SQL; the same argument 0059 made about the category tree.
    'brands', coalesce((
      select jsonb_agg(distinct b.brand order by b.brand) from branded b
    ), '[]'::jsonb),
    'sizes', coalesce((
      select jsonb_agg(distinct s order by s) from scoped pr, unnest(pr.sizes) as s
    ), '[]'::jsonb),
    'colors', coalesce((
      select jsonb_agg(distinct c order by c) from scoped pr, unnest(pr.colors) as c
    ), '[]'::jsonb),
    'productTypes', coalesce((
      select jsonb_agg(distinct pr.product_type::text order by pr.product_type::text)
      from scoped pr where pr.product_type <> 'general'
    ), '[]'::jsonb),
    'ram', coalesce((
      select jsonb_agg(distinct pr.ram_gb order by pr.ram_gb)
      from scoped pr where pr.ram_gb is not null
    ), '[]'::jsonb),
    'storage', coalesce((
      select jsonb_agg(distinct pr.storage_gb order by pr.storage_gb)
      from scoped pr where pr.storage_gb is not null
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(distinct pr.specs->>'condition' order by pr.specs->>'condition')
      from scoped pr
      where pr.product_type = 'phone' and pr.specs ? 'condition'
    ), '[]'::jsonb),
    'priceFloor',   coalesce((select min(price) from eff), 0),
    'priceCeiling', coalesce((select max(price) from eff), 0),
    'total',     (select count(*) from scoped),
    'available', (select count(*) from scoped where status = 'available'),
    'low',       (select count(*) from scoped where status = 'low'),
    'out',       (select count(*) from scoped where status = 'out')
  );
$$;

revoke execute on function shop_facets(uuid, text[]) from public;
grant  execute on function shop_facets(uuid, text[]) to anon, authenticated;
