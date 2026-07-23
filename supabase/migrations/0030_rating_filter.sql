-- Filter products by minimum rating.
--
-- search_products gains p_min_rating. A NULL means "no rating constraint";
-- otherwise only products whose average `rating` is at least that value pass.
-- Products with no reviews have rating 0, so they correctly drop out of a
-- "4 stars & up" filter rather than masquerading as unrated-but-included.
--
-- Signature changes ⇒ DROP the old one and recreate. The DROP resets the ACL to
-- execute-to-public, so the revoke/grant at the bottom is load-bearing, not
-- ceremony — same trap as 0022/0023/0026/0027/0028.

drop function if exists search_products(uuid, text, text, text, int, text, int, int, text[], text[]);

create or replace function search_products(
  p_merchant_id uuid default null,
  p_search      text default '',
  p_category    text default null,
  p_status      text default null,
  p_max_price   int  default null,
  p_sort        text default 'newest',
  p_limit       int  default 12,
  p_offset      int  default 0,
  p_sizes       text[] default null,
  p_colors      text[] default null,
  p_min_rating  numeric default null
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
    where p_merchant_id is null or pr.merchant_id = p_merchant_id
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
    m.images, m.sizes, m.colors, m.size_price_adj, m.color_price_adj,
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
