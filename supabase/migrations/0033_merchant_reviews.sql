-- Merchant-facing Reviews page: every rating left on any of the caller's own
-- products, with a rating-distribution summary and per-product filtering.
--
-- Unlike product_reviews() (0029), which only returns rows with written text
-- (it feeds a public product page), this returns EVERY rating including
-- star-only ones with no comment — a merchant checking "how is this product
-- doing" cares about a run of quiet 2-star ratings just as much as a written
-- complaint.
--
-- security invoker, not definer: `reviews public read` (0009) already makes
-- every row here readable by anyone, so invoker changes nothing about what
-- data is reachable — it just avoids granting definer privileges this
-- function doesn't need. The `p.merchant_id = (select uid)` filter is what
-- actually scopes results to the caller's own shop.
--
-- Returns a camelCase jsonb view-model (mirrors merchant_analytics, 0020):
-- this feeds one page, so a thin cast beats a mapper.

create or replace function merchant_reviews(
  p_product_id uuid default null,
  p_limit      int  default 20,
  p_offset     int  default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select least(greatest(coalesce(p_limit, 20), 1), 50) as lim,
           greatest(coalesce(p_offset, 0), 0)             as off
  ),
  uid as (select auth.uid() as id),
  mine as (
    select
      r.product_id,
      p.name as product_name,
      coalesce(p.images[1], '') as image,
      r.stars,
      r.comment,
      r.reviewer_name,
      r.created_at
    from reviews r
    join products p on p.id = r.product_id
    where p.merchant_id = (select id from uid)
      and (p_product_id is null or r.product_id = p_product_id)
  ),
  dist as (
    select
      count(*)                          as total,
      coalesce(round(avg(stars), 1), 0) as avg_rating,
      count(*) filter (where stars = 1) as s1,
      count(*) filter (where stars = 2) as s2,
      count(*) filter (where stars = 3) as s3,
      count(*) filter (where stars = 4) as s4,
      count(*) filter (where stars = 5) as s5
    from mine
  ),
  page as (
    select * from mine
    order by created_at desc
    limit  (select lim from bounds)
    offset (select off from bounds)
  )
  select jsonb_build_object(
    'avgRating', (select avg_rating from dist),
    'totalReviews', (select total from dist),
    'distribution', jsonb_build_object(
      '1', (select s1 from dist), '2', (select s2 from dist), '3', (select s3 from dist),
      '4', (select s4 from dist), '5', (select s5 from dist)
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', product_id,
        'productName', product_name,
        'image', image,
        'stars', stars,
        'comment', comment,
        'reviewerName', reviewer_name,
        'createdAt', created_at
      ) order by created_at desc)
      from page
    ), '[]'::jsonb),
    'totalCount', (select total from dist)
  );
$$;

revoke execute on function merchant_reviews(uuid, int, int) from public, anon;
grant execute on function merchant_reviews(uuid, int, int) to authenticated;
