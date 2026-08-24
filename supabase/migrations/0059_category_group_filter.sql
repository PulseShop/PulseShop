-- ---------------------------------------------------------------------------
-- 0059  Filter by MANY categories at once, so the ribbon can be two levels.
--
-- WHAT THE FILTER RIBBON COULD NOT SAY. `products.category` holds a leaf
-- ("Hair Care", "Gaming Consoles") and search_products has matched it with a
-- single equality since 0022: one category, or all of them. The taxonomy has
-- had a group level over those leaves since the product form grew optgroups,
-- but the group was presentation only — nothing could query it, so every filter
-- surface flattened the tree back into one long strip of leaf chips.
--
-- That makes the two questions a shopper actually asks unaskable. "Show me
-- beauty" is a group, and there is no single leaf that means it. "Show me hair
-- products and makeup, but nothing else in beauty" is a SUBSET of a group, and
-- there is no way to name two leaves at once. Both are one predicate away.
--
-- p_categories text[] is that predicate: match any leaf in the list. The group
-- level stays entirely in the client, which is the right place for it — the
-- grouping is a merchandising decision that gets re-cut as the catalogue grows
-- (0057's showcase re-cuts it already), and baking a fixed tree into a table
-- here would mean a migration every time a leaf moves. The client expands the
-- chosen group to its leaves and sends those; the database only ever answers
-- "which products are in this set of categories", which is a question that
-- stays true however the tree is drawn above it.
--
-- WHY NOT REPLACE p_category. It stays, and it stays first, because it is what
-- every other caller sends: the storefront's own grid, the product page's
-- related-items query (ProductDetailPage), the search page's category rail.
-- Rewriting all of them to send a one-element array to gain nothing is churn,
-- and a client that has not shipped yet would break against a function that
-- dropped the parameter. The two compose as AND, which is the honest reading:
-- if a caller somehow sends both, the result is what satisfies both.
--
-- p_categories is appended at the END of the parameter list rather than slotted
-- in beside p_category where it reads better. PostgREST calls by name so the
-- position is invisible to the client, and appending keeps the DROP below
-- matching the live 0050 signature exactly — which matters, because getting
-- that list wrong leaves two overloads behind and PostgREST then refuses to
-- pick one. Same trap 0026/0027/0028/0030/0036/0037/0038/0039/0044/0048 all
-- flagged.
--
-- Body is the live 0050 body plus one predicate. Nothing else changes: the
-- relevance tiers, the price range, the variant filters and the spec filters
-- are all carried over verbatim.
-- ---------------------------------------------------------------------------
drop function if exists search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int);

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
  p_categories  text[] default null   -- null / empty = any category; else any leaf in the list
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
      -- The set form of the line above (0059). AND, not OR: a caller sending
      -- both is asking for what satisfies both, and in practice only one of the
      -- two is ever set.
      and (
        coalesce(array_length(p_categories, 1), 0) = 0
        or p.category = any (p_categories)
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

revoke execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int, text[]) from public;
grant  execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int, text[]) to anon, authenticated;
