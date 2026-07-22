-- Per-variant pricing: a size or a colour can cost more (or less) than the base.
--
-- MODEL: base price + one adjustment per size + one adjustment per colour,
-- NOT a price per size×colour pairing. Six sizes and ten colours is sixteen
-- numbers for the seller to think about instead of sixty, and it expresses what
-- sellers actually price on — a bigger garment costs more to make, a particular
-- dye costs more to buy — without asking them to fill in a matrix where 58 of
-- the 60 cells are the same number.
--
-- Adjustments are stored as jsonb maps keyed by the size/colour NAME, matching
-- the names in products.sizes / products.colors:
--     size_price_adj  = {"XL": 150, "XXL": 250}
--     color_price_adj = {"Navy": 100}
-- A key that isn't present is +0, so the common case stores '{}' and costs
-- nothing. Keying by name (not by index) means reordering or removing a size
-- can never silently reprice a different one.
--
-- ORDER OF OPERATIONS: the discount applies to the ADJUSTED price, not the
-- base. A 50%-off jacket at 5,000 with XL at +200 sells for 2,600, not 2,700 —
-- the shopper is buying an XL jacket at half price, not a jacket at half price
-- with a full-price surcharge bolted on. Every surface that computes a price
-- goes through effective_price() below so they cannot disagree about this.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table products
  add column if not exists size_price_adj  jsonb not null default '{}'::jsonb,
  add column if not exists color_price_adj jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Helpers
--
-- All IMMUTABLE: CHECK constraints reject anything less, and the price
-- expressions want to be inlinable inside search_products' per-row scan.
-- ---------------------------------------------------------------------------

-- Shape guard for the adjustment maps. A CHECK cannot contain a subquery, but
-- it can CALL a function that does — the same workaround 0021 uses for
-- text_array_len/all_http_urls.
create or replace function jsonb_int_map_ok(
  p_map jsonb, p_lo int, p_hi int, p_max_entries int
) returns boolean
language sql immutable
set search_path = public
as $$
  select p_map is null or (
    jsonb_typeof(p_map) = 'object'
    and (select count(*) from jsonb_object_keys(p_map)) <= p_max_entries
    and not exists (
      select 1
      from jsonb_each(p_map) e
      where jsonb_typeof(e.value) <> 'number'
         or (e.value)::numeric <> trunc((e.value)::numeric)   -- whole shillings only
         or (e.value)::numeric < p_lo
         or (e.value)::numeric > p_hi
    )
  );
$$;

alter table products
  drop constraint if exists products_size_adj_ok,
  drop constraint if exists products_color_adj_ok;

alter table products
  add constraint products_size_adj_ok
    check (jsonb_int_map_ok(size_price_adj,  -100000000, 100000000, 30)),
  add constraint products_color_adj_ok
    check (jsonb_int_map_ok(color_price_adj, -100000000, 100000000, 30));

/** The adjustment for one chosen option. A missing key — or no choice at all — is +0. */
create or replace function variant_adj(p_map jsonb, p_key text)
returns int
language sql immutable
set search_path = public
as $$
  select coalesce((p_map ->> p_key)::int, 0);
$$;

/**
 * The CHEAPEST adjustment across the options a product actually offers.
 *
 * This is what makes a product comparable to other products: with variants it
 * no longer has "a price", it has a range, and the one number a grid can sort
 * and a filter can compare is the lowest price a shopper could actually pay.
 * Options with no entry count as +0, which is why an unpriced size correctly
 * drags the minimum back down to the base price.
 */
create or replace function variant_min_adj(p_map jsonb, p_options text[])
returns int
language sql immutable
set search_path = public
as $$
  select coalesce(
    (select min(coalesce((p_map ->> o)::int, 0))
     from unnest(coalesce(p_options, '{}'::text[])) o),
    0);
$$;

/** Base + adjustment, then the percentage discount. The single definition of
 * what anything costs; lib/currency.ts mirrors it exactly. */
create or replace function effective_price(p_price int, p_discount int, p_adj int)
returns int
language sql immutable
set search_path = public
as $$
  select greatest(
    round((p_price + coalesce(p_adj, 0)) * (1 - coalesce(p_discount, 0) / 100.0))::int,
    0);
$$;

-- ---------------------------------------------------------------------------
-- search_products: sort/filter on the LOWEST price a shopper could pay, and
-- return the adjustment maps so the client can price a selection without a
-- round trip.
--
-- The return type changes, so this has to be DROPped and recreated (create or
-- replace cannot change it) — which resets the ACL, making the revoke/grant
-- below load-bearing rather than ceremony. Same trap as 0023 and 0026.
-- ---------------------------------------------------------------------------
drop function if exists search_products(uuid, text, text, text, int, text, int, int, text[], text[]);

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
  p_colors      text[] default null   -- null / empty = any colour
)
returns table (
  id              uuid,
  merchant_id     uuid,
  name            text,
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
  -- The cheapest this product can be bought for. Filtering and sorting on
  -- anything else shows the shopper a number they can't actually pay: sorting
  -- on the base price would rank a product by a price no variant of it costs.
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
  -- Referenced twice (paged rows + total), so Postgres materialises this once
  -- and both the count and the page come out of a single scan.
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
  )
  select
    m.id, m.merchant_id, m.name, m.sku, m.category,
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

revoke execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[]) from public;
grant  execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- shop_facets: the price slider has to top out at the highest LOWEST-price in
-- the catalogue, because that is the number p_max_price is compared against.
-- Measuring it any other way silently hides the shop's dearest item at full
-- slider travel — the same bug 0023 fixed for discounts.
-- ---------------------------------------------------------------------------
create or replace function shop_facets(p_merchant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(distinct pr.category order by pr.category)
      from products pr where pr.merchant_id = p_merchant_id
    ), '[]'::jsonb),
    'sizes', coalesce((
      select jsonb_agg(distinct s order by s)
      from products pr, unnest(pr.sizes) as s
      where pr.merchant_id = p_merchant_id
    ), '[]'::jsonb),
    'colors', coalesce((
      select jsonb_agg(distinct c order by c)
      from products pr, unnest(pr.colors) as c
      where pr.merchant_id = p_merchant_id
    ), '[]'::jsonb),
    'priceCeiling', coalesce((
      select max(effective_price(
               pr.price_kes, pr.discount_pct,
               variant_min_adj(pr.size_price_adj,  pr.sizes)
             + variant_min_adj(pr.color_price_adj, pr.colors)))
      from products pr where pr.merchant_id = p_merchant_id
    ), 0),
    'total',     (select count(*) from products pr where pr.merchant_id = p_merchant_id),
    'available', (select count(*) from products pr where pr.merchant_id = p_merchant_id and pr.status = 'available'),
    'low',       (select count(*) from products pr where pr.merchant_id = p_merchant_id and pr.status = 'low'),
    'out',       (select count(*) from products pr where pr.merchant_id = p_merchant_id and pr.status = 'out')
  );
$$;

revoke execute on function shop_facets(uuid) from public;
grant  execute on function shop_facets(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- place_order: charge for the variant the buyer actually chose.
--
-- This is the half that matters. The cart's unit price is a client-side
-- snapshot and always has been; the price the buyer is CHARGED is recomputed
-- here from the product row. Without this change that recomputation would keep
-- returning the base price, so a shopper could pick the +350 XXXL, watch the
-- page say 1,550, and be billed 1,200 — the seller silently eating the
-- difference on every variant sale.
--
-- Signature and return type are unchanged, so create-or-replace preserves the
-- 0024 grants (service_role only, via the place-order Edge Function). Restated
-- below anyway so this file stands alone against a fresh database.
-- ---------------------------------------------------------------------------
create or replace function place_order(
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_notes   text,
  p_channel          order_channel,
  p_payment_method   payment_method,
  -- [{ "product_id": uuid, "size": text|null, "color": text|null, "qty": int }, ...]
  p_items            jsonb,
  p_idempotency_key  uuid default null,
  -- Supplied by the Edge Function after it verifies the caller's JWT. Null for
  -- a genuine guest checkout.
  p_customer_id      uuid default null
)
returns table(order_id uuid, reference text, access_token text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order_id    uuid := gen_random_uuid();
  v_reference   text;
  v_token       text := new_order_token();
  v_merchant_id uuid;
  v_subtotal    integer := 0;
  v_lines       order_line[] := '{}';
  v_line_json   jsonb;
  v_product     products%rowtype;
  v_unit        integer;
  v_qty         integer;
  v_size        text;
  v_color       text;
  v_attempts    integer := 0;
  v_existing    orders%rowtype;
begin
  -- Replay of an attempt we already completed: hand back the SAME order rather
  -- than placing a second one. Checked before any stock is touched.
  if p_idempotency_key is not null then
    select * into v_existing from orders o where o.idempotency_key = p_idempotency_key;
    if found then
      return query select v_existing.id, v_existing.reference, v_existing.access_token;
      return;
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'order must have at least one item';
  end if;
  -- Bounds on the work one call can ask for. Nothing legitimate needs more, and
  -- without them a single request can loop over an unbounded item list.
  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many items in one order';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) = 0
     or length(trim(coalesce(p_customer_phone, ''))) = 0 then
    raise exception 'customer name and phone are required';
  end if;

  for v_line_json in select * from jsonb_array_elements(p_items) loop
    v_qty   := (v_line_json->>'qty')::integer;
    v_size  := nullif(v_line_json->>'size', '');
    v_color := nullif(v_line_json->>'color', '');

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid quantity';
    end if;
    if v_qty > 100 then
      raise exception 'quantity too large';
    end if;

    -- FOR UPDATE: hold the row until commit so two buyers racing for the last
    -- unit cannot both pass the stock check below.
    select * into v_product from products
      where id = (v_line_json->>'product_id')::uuid
      for update;
    if not found then
      raise exception 'product not found: %', v_line_json->>'product_id';
    end if;

    if v_merchant_id is null then
      v_merchant_id := v_product.merchant_id;
    elsif v_product.merchant_id <> v_merchant_id then
      raise exception 'all items in an order must belong to the same shop';
    end if;

    if v_product.stock_qty < v_qty then
      raise exception 'insufficient stock for %', v_product.name;
    end if;

    -- The variant the buyer picked has to be one the SELLER actually offers.
    -- The client already enforces this, but the client is not a security
    -- boundary — and now it is also a PRICING boundary: an unoffered size would
    -- otherwise price at +0 rather than being refused.
    if coalesce(array_length(v_product.sizes, 1), 0) > 0
       and v_size is not null
       and not (v_size = any(v_product.sizes)) then
      raise exception 'size % is not available for %', v_size, v_product.name;
    end if;
    if coalesce(array_length(v_product.colors, 1), 0) > 0
       and v_color is not null
       and not (v_color = any(v_product.colors)) then
      raise exception 'color % is not available for %', v_color, v_product.name;
    end if;

    -- Price is recomputed from the DB, never taken from the cart the client
    -- sent — now including the chosen variant's adjustment. Mirrors
    -- lib/currency.ts variantPrice().
    v_unit := effective_price(
      v_product.price_kes,
      v_product.discount_pct,
      variant_adj(v_product.size_price_adj,  v_size)
    + variant_adj(v_product.color_price_adj, v_color)
    );
    v_subtotal := v_subtotal + v_unit * v_qty;

    update products set stock_qty = stock_qty - v_qty where id = v_product.id;

    v_lines := v_lines || row(
      v_product.id, v_product.name, coalesce(v_product.images[1], ''),
      v_size, v_qty, v_unit, v_color
    )::order_line;
  end loop;

  loop
    v_reference := 'PS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
    exit when not exists (select 1 from orders where orders.reference = v_reference);
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then
      raise exception 'could not generate a unique order reference';
    end if;
  end loop;

  insert into orders (
    id, reference, access_token, merchant_id, customer_id, idempotency_key,
    customer_name, customer_phone, customer_notes,
    channel, payment_method, payment_status, subtotal_kes, total_kes
  ) values (
    v_order_id, v_reference, v_token, v_merchant_id, p_customer_id, p_idempotency_key,
    trim(p_customer_name), trim(p_customer_phone), coalesce(p_customer_notes, ''),
    p_channel, p_payment_method, 'pending', v_subtotal, v_subtotal
  );

  insert into order_items (order_id, product_id, product_name, image, size, color, qty, unit_price_kes)
  select v_order_id, l.product_id, l.product_name, l.image, l.size, l.color, l.qty, l.unit_price_kes
  from unnest(v_lines) as l;

  return query select v_order_id, v_reference, v_token;

exception
  -- Two genuinely simultaneous requests carrying the same key: both passed the
  -- replay check above, one won the unique index. The loser must return the
  -- winner's order, not an error — from the buyer's side this is still one tap.
  when unique_violation then
    select * into v_existing from orders o where o.idempotency_key = p_idempotency_key;
    if found then
      return query select v_existing.id, v_existing.reference, v_existing.access_token;
      return;
    end if;
    raise;
end;
$function$;

revoke execute on function place_order(text, text, text, order_channel, payment_method, jsonb, uuid, uuid) from public, anon, authenticated;
grant  execute on function place_order(text, text, text, order_channel, payment_method, jsonb, uuid, uuid) to service_role;
