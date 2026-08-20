-- ---------------------------------------------------------------------------
-- 0058  Deals of the day: every product currently marked down, in one call.
--
-- The front page is being rearranged again. The browsing half now leads with
-- the category wall and follows it with a discount shelf, which needs a fact
-- the API could not answer: which products across EVERY shop carry a discount
-- right now.
--
-- WHY NOT FILTER search_products ON THE CLIENT. The obvious version fetches a
-- page and keeps the rows whose discount_pct is set, which is wrong in the same
-- way 0057 describes: a page is a sample, so the shelf would show whichever
-- markdowns happened to fall inside the first twelve rows and would go empty
-- the day a shop lists a dozen full-price products. A shelf called "every
-- product on discount" has to be a query over the whole table.
--
-- WHY NOT A FLAG ON search_products. Adding a defaulted parameter to that
-- function creates an OVERLOAD, and PostgREST resolving between two signatures
-- that differ only by a trailing default is exactly the ambiguity 0049 went out
-- of its way to avoid on admin_upsert_banner_placement. A separate read is one
-- function with one signature, and it sits beside list_shop_features (0046) and
-- list_category_showcase (0057), which are the same shape of thing: a public,
-- unpaginated, purpose-built shelf for one strip of the marketplace.
--
-- ORDERED BY HOW BIG THE SAVING IS, not by recency. The shelf answers "what is
-- worth buying today", and the honest ranking for that is the discount itself;
-- created_at would hand the top of the shelf to whoever listed last and hold it
-- there. Ties break on price descending, so the two 30%-off products lead with
-- the one where 30% is more money.
--
-- ELIGIBILITY MATCHES THE BANNER AND THE WALL: closing shops, out-of-stock
-- products and products with no photograph are all excluded. A deal a shopper
-- cannot buy is not a deal, and a tile with no picture renders as a hole.
--
-- SECURITY INVOKER: products and merchants are publicly readable already, so
-- this needs no elevated rights and RLS stays the boundary.
-- ---------------------------------------------------------------------------
create or replace function list_deals(p_limit int default 24)
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
as $fn$
  select
    p.id, p.merchant_id, p.name, p.slug, p.sku, p.category,
    p.price_kes, p.discount_pct, p.stock_qty, p.status,
    p.images, coalesce(p.image_alt, '{}'::text[]),
    p.sizes, p.colors, p.size_price_adj, p.color_price_adj, p.color_images,
    p.product_type, p.specs, p.rating, p.review_count,
    p.summary, coalesce(p.description, ''), p.created_at,
    m.handle, m.name
  from products p
  join merchants m on m.id = p.merchant_id
  where m.shop_status <> 'closing'
    and p.status <> 'out'
    and coalesce(p.discount_pct, 0) > 0
    and coalesce(array_length(p.images, 1), 0) > 0
  order by p.discount_pct desc, p.price_kes desc, p.created_at desc
  -- Capped, because this is a shelf and not a catalogue. A shopper who wants
  -- every markdown in a category has the category page and the price filter.
  limit least(greatest(coalesce(p_limit, 24), 1), 60);
$fn$;

-- The read is "everything discounted, biggest first", so the index carries the
-- predicate and the leading sort key. Partial, because the overwhelming
-- majority of a catalogue is not on offer at any given moment.
create index if not exists products_discounted_idx
  on products (discount_pct desc, price_kes desc)
  where discount_pct is not null and discount_pct > 0;

revoke execute on function list_deals(int) from public;
grant  execute on function list_deals(int) to anon, authenticated;
