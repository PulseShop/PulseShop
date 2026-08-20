-- ---------------------------------------------------------------------------
-- 0057  A cover image and a count for every category, in one round trip.
--
-- The front page is being rearranged around the taxonomy: instead of one flat
-- grid of everything, the browsing half becomes a wall of cards, one per
-- category GROUP, each showing its stocked leaf categories as picture tiles.
-- That layout needs two facts per leaf category that nothing on the API could
-- answer: a representative photograph, and how many products sit behind it.
--
-- WHY NOT DO IT ON THE CLIENT. The obvious version fetches a page of products
-- and groups them in JavaScript, which is wrong in a way that gets worse as the
-- catalogue grows: a page of 12 or 200 products is a sample, so a category
-- whose only listings fall outside the sample renders as empty and a category
-- with 300 products claims however many happened to be fetched. The counts have
-- to be aggregates over the whole table or they are not counts. The alternative
-- — one query per leaf category — is ~37 round trips before first paint.
--
-- WHY THE COVER ROTATES. distinct on picks one product per category and the
-- inner ordering decides which; hashing the product id against the current hour
-- is the same fairness trick list_shop_features uses (0046). Ordering by
-- recency instead would hand every category tile to whichever shop listed last
-- and hold it there, so a category's picture would advertise one seller
-- indefinitely. Hourly means the choice is stable within an hour — still
-- cacheable, still the same image across a shopper's visit — and comes round to
-- everyone else in turn.
--
-- ELIGIBILITY MATCHES THE BANNER. Closing shops, out-of-stock products and
-- products with no photograph are all excluded, because a tile is a picture and
-- a link: without an image it renders blank, and it should not lead a shopper
-- to a shelf they cannot buy from. `product_count` counts the same eligible set
-- the cover was drawn from, so the number under a tile and the products behind
-- it are the same population.
--
-- SECURITY INVOKER: products and merchants are publicly readable already, so
-- this needs no elevated rights and RLS stays the boundary.
-- ---------------------------------------------------------------------------
create or replace function list_category_showcase(p_limit int default 60)
returns table (
  category      text,
  product_count integer,
  image         text,
  image_alt     text
)
language sql
stable
security invoker
set search_path = public
as $$
  with sellable as (
    select
      p.id,
      btrim(p.category) as category,
      p.images,
      coalesce(p.image_alt, '{}'::text[]) as image_alt
    from products p
    join merchants m on m.id = p.merchant_id
    where m.shop_status <> 'closing'
      and p.status <> 'out'
      and coalesce(array_length(p.images, 1), 0) > 0
      and coalesce(btrim(p.category), '') <> ''
  ),
  tallies as (
    select s.category, count(*)::int as product_count
    from sellable s
    group by s.category
  ),
  covers as (
    select distinct on (s.category)
      s.category,
      s.images[1] as image,
      nullif(btrim(coalesce(s.image_alt[1], '')), '') as image_alt
    from sellable s
    order by s.category, md5(s.id::text || date_trunc('hour', now())::text)
  )
  select t.category, t.product_count, c.image, c.image_alt
  from tallies t
  join covers c on c.category = t.category
  -- Busiest first. The caller regroups these into cards by the taxonomy in
  -- lib/constants.ts, and within a card it keeps this order, so the leaf with
  -- the most to show is the first tile a shopper's eye lands on.
  order by t.product_count desc, t.category
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

revoke execute on function list_category_showcase(int) from public;
grant  execute on function list_category_showcase(int) to anon, authenticated;
