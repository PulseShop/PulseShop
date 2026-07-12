-- Kill the /shops N+1.
--
-- Before: ShopsPage cost 5N+1 round trips for N shops — one query for the
-- merchant rows, then merchantStats() fired 4 more per shop (product count +
-- merchant_order_count + merchant_follower_count + merchant_avg_rating), then
-- the page fired listShopProducts() per shop just to show 3 thumbnails (and
-- that query pulled the shop's ENTIRE catalogue). At 3000 shops that is ~15k
-- HTTP requests for one page view; it never completes.
--
-- After: one paginated RPC returns each shop with its counts already
-- aggregated and its 3 preview products embedded. /shops is now 2 requests
-- (directory + the viewer's follow list) regardless of how many shops exist.
--
-- security definer is required, and is the same trade-off merchant_order_count
-- already makes: `orders owner read` RLS only exposes orders to the owning
-- merchant and `follows` RLS only exposes rows to the follower, so a public
-- visitor counting either reads 0. Everything returned here is data the public
-- storefront already shows — public merchant columns plus aggregate counts. No
-- merchant-internal or buyer data crosses the boundary.

create or replace function shop_directory(p_limit int default 20, p_offset int default 0)
returns table (
  id             uuid,
  name           text,
  handle         text,
  bio            text,
  location       text,
  avatar_url     text,
  banner_url     text,
  is_online      boolean,
  whatsapp       text,
  instagram      text,
  facebook       text,
  product_count  bigint,
  order_count    bigint,
  follower_count bigint,
  avg_rating     numeric,
  previews       jsonb,
  total_count    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    -- Clamp so a caller can't ask for the whole table with shop_directory(999999).
    select least(greatest(coalesce(p_limit, 20), 1), 50) as lim,
           greatest(coalesce(p_offset, 0), 0)            as off
  ),
  page as (
    select m.*
    from merchants m
    order by m.created_at desc, m.id
    limit  (select lim from bounds)
    offset (select off from bounds)
  )
  select
    p.id,
    p.name,
    p.handle,
    coalesce(p.bio, ''),
    coalesce(p.location, ''),
    coalesce(p.avatar_url, ''),
    coalesce(p.banner_url, ''),
    p.is_online,
    coalesce(p.whatsapp, ''),
    coalesce(p.instagram, ''),
    coalesce(p.facebook, ''),
    coalesce(pc.cnt, 0),
    coalesce(oc.cnt, 0),
    coalesce(fc.cnt, 0),
    coalesce(pc.avg_rating, 0),
    coalesce(pv.previews, '[]'::jsonb),
    (select count(*) from merchants)
  from page p
  -- Product count and the review-count-weighted rating average in one pass.
  left join lateral (
    select count(*) as cnt,
           round(sum(pr.rating * pr.review_count) / nullif(sum(pr.review_count), 0), 1) as avg_rating
    from products pr
    where pr.merchant_id = p.id
  ) pc on true
  left join lateral (
    select count(*) as cnt from orders o where o.merchant_id = p.id
  ) oc on true
  left join lateral (
    select count(*) as cnt from follows f where f.merchant_id = p.id
  ) fc on true
  -- The 3 newest products that actually have an image, as [{id, name, image}].
  -- Replaces the per-shop full-catalogue fetch the page used to do.
  left join lateral (
    select jsonb_agg(
             jsonb_build_object('id', t.id, 'name', t.name, 'image', t.image)
             order by t.created_at desc
           ) as previews
    from (
      select pr.id, pr.name, pr.images[1] as image, pr.created_at
      from products pr
      where pr.merchant_id = p.id
        and coalesce(array_length(pr.images, 1), 0) > 0
      order by pr.created_at desc
      limit 3
    ) t
  ) pv on true
  order by p.created_at desc, p.id;
$$;

-- Public discover list — same anon-callable rationale as merchant_order_count.
revoke execute on function shop_directory(int, int) from public;
grant  execute on function shop_directory(int, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Single-shop stats, for the storefront hero and the merchant's own dashboard.
--
-- Same 4-round-trip problem as the directory, one shop at a time: getShop() and
-- getMerchant() each fired 4 queries to fill Merchant.stats. This collapses
-- them into one. Every storefront page view pays this, so it is worth it.
-- ---------------------------------------------------------------------------
create or replace function merchant_stats(p_merchant_id uuid)
returns table (
  product_count  bigint,
  order_count    bigint,
  follower_count bigint,
  avg_rating     numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select count(*) from products  pr where pr.merchant_id = p_merchant_id), 0),
    coalesce((select count(*) from orders    o  where o.merchant_id  = p_merchant_id), 0),
    coalesce((select count(*) from follows   f  where f.merchant_id  = p_merchant_id), 0),
    coalesce((
      select round(sum(pr.rating * pr.review_count) / nullif(sum(pr.review_count), 0), 1)
      from products pr where pr.merchant_id = p_merchant_id
    ), 0);
$$;

revoke execute on function merchant_stats(uuid) from public;
grant  execute on function merchant_stats(uuid) to anon, authenticated;

-- Supports the keyset/offset ordering the directory pages on.
create index if not exists merchants_created_idx on merchants(created_at desc, id);

-- The storefront + inventory grids page products newest-first within a shop;
-- without this the (merchant_id) index still has to sort every page.
create index if not exists products_merchant_created_idx
  on products(merchant_id, created_at desc);

-- Same for the merchant's order list, which now pages on placed_at.
create index if not exists orders_merchant_placed_idx
  on orders(merchant_id, placed_at desc);
