-- ---------------------------------------------------------------------------
-- 0046  Drop paid placement; give every registered shop a banner slot instead.
--
-- 0045 shipped `promotions`, where a shop on a paid plan could buy its way into
-- the strip at the top of the marketplace. That is being pulled before it ever
-- carried a row: billing does not exist, so the "paid" half was never real, and
-- what actually shipped was a banner that shops on the higher plans could fill
-- for free while everyone else was locked out.
--
-- The replacement inverts it. The strip now shows ONE product from EVERY shop,
-- chosen by the database rather than bought, so a shop that registered today
-- gets the same exposure as the busiest one on the platform.
--
-- `plan_upgrade_requests` is deliberately left in place. Nothing writes to it
-- while the subscription buttons are locked, but it costs nothing to keep and
-- it is the table a real billing flow will resolve against.
-- ---------------------------------------------------------------------------

-- Order matters: list_promotions and the insert policy on `promotions` both
-- depend on these, so the table goes before the function it calls.
drop function if exists list_promotions(int);
drop table if exists promotions;
drop function if exists merchant_can_promote(uuid);

-- ---------------------------------------------------------------------------
-- list_shop_features: one product per shop, for the marketplace banner.
--
-- DISTINCT ON (merchant_id) picks a single row per shop, and the inner ORDER BY
-- decides WHICH one: newest first, so a shop that just listed something sees it
-- surface. Only products that can actually be bought and shown are eligible, so
-- the banner never advertises something out of stock or renders a blank tile.
--
-- The outer ordering is the fairness half, and it is not cosmetic. Ordering by
-- recency across shops would mean that once there are more shops than slots,
-- the same handful of shops hold the banner permanently and a quiet shop is
-- never seen; that is the lockout this migration exists to remove. Hashing the
-- product id against the current hour rotates the selection every hour while
-- staying stable within it, so the result is still cacheable and every shop
-- comes up in turn.
--
-- SECURITY INVOKER: products and merchants are both publicly readable already,
-- so this needs no elevated rights, and RLS stays the boundary.
-- ---------------------------------------------------------------------------
create or replace function list_shop_features(p_limit int default 8)
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
  shop_name       text
)
language sql
stable
security invoker
set search_path = public
as $$
  with per_shop as (
    select distinct on (p.merchant_id)
      p.id, p.merchant_id, p.name, p.slug, p.sku, p.category,
      p.price_kes, p.discount_pct, p.stock_qty, p.status,
      p.images, coalesce(p.image_alt, '{}'::text[]) as image_alt,
      p.sizes, p.colors, p.size_price_adj, p.color_price_adj, p.color_images,
      p.product_type, p.specs, p.rating, p.review_count,
      p.summary, coalesce(p.description, '') as description, p.created_at,
      m.handle as shop_handle, m.name as shop_name
    from products p
    join merchants m on m.id = p.merchant_id
    where m.shop_status <> 'closing'
      and p.status <> 'out'
      and coalesce(array_length(p.images, 1), 0) > 0
    order by p.merchant_id, p.created_at desc
  )
  select * from per_shop
  order by md5(per_shop.id::text || date_trunc('hour', now())::text)
  limit least(greatest(coalesce(p_limit, 8), 1), 12);
$$;

revoke execute on function list_shop_features(int) from public;
grant  execute on function list_shop_features(int) to anon, authenticated;
