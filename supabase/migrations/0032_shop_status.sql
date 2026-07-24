-- Shop status: open / closed / closing, replacing the is_online boolean.
--
-- SEMANTICS (seller-controlled, in the shop dashboard):
--   open    — normal. Listed everywhere, checkout allowed.
--   closed  — temporary break. Still listed and browsable (buyers can see
--             what the shop sells and plan ahead), but checkout is blocked —
--             an order the seller cannot act on for a while is worse than no
--             order.
--   closing — winding down for good. Removed from search, the shop directory,
--             and the sitemap, and its storefront 404s. Existing orders keep
--             working (get_order_by_token is untouched) — a buyer who already
--             ordered must not lose their receipt the moment the seller starts
--             shutting down.
--
-- place_order is the actual gate; everything else here is discovery surfaces
-- (a hidden shop whose checkout still worked would just be a confusing bug).

alter table merchants add column if not exists shop_status text not null default 'open';

update merchants set shop_status = case when is_online then 'open' else 'closed' end
where shop_status = 'open';  -- only touch rows still at the just-added default

alter table merchants drop constraint if exists merchants_shop_status_chk;
alter table merchants add constraint merchants_shop_status_chk
  check (shop_status in ('open', 'closed', 'closing'));

alter table merchants drop column if exists is_online;

-- ---------------------------------------------------------------------------
-- place_order: refuse a new order once the shop is anything but 'open'.
-- Checked once, at the point v_merchant_id is first resolved (not per line
-- item — every line already has to belong to that same shop).
--
-- Signature and return type are unchanged from 0027, so create-or-replace
-- preserves its grants; restated anyway so this file stands alone.
-- ---------------------------------------------------------------------------
create or replace function place_order(
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_notes   text,
  p_channel          order_channel,
  p_payment_method   payment_method,
  p_items            jsonb,
  p_idempotency_key  uuid default null,
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

    select * into v_product from products
      where id = (v_line_json->>'product_id')::uuid
      for update;
    if not found then
      raise exception 'product not found: %', v_line_json->>'product_id';
    end if;

    if v_merchant_id is null then
      v_merchant_id := v_product.merchant_id;
      -- Gate the whole order on the shop's status, checked once at this point
      -- rather than per line — every subsequent line is already required to
      -- match v_merchant_id below.
      if exists (
        select 1 from merchants mm
        where mm.id = v_merchant_id and mm.shop_status <> 'open'
      ) then
        raise exception 'this shop is not accepting orders right now';
      end if;
    elsif v_product.merchant_id <> v_merchant_id then
      raise exception 'all items in an order must belong to the same shop';
    end if;

    if v_product.stock_qty < v_qty then
      raise exception 'insufficient stock for %', v_product.name;
    end if;

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

-- ---------------------------------------------------------------------------
-- search_products: a 'closing' shop's products no longer surface in search —
-- discovery and checkout should agree on whether a shop is reachable.
-- 'closed' shops keep searching fine; only checkout blocks those.
--
-- Filter lives in `priced` (before `matched`), so total_count — computed from
-- `matched` — reflects the exclusion too, not just the returned page.
--
-- Signature is unchanged from 0030, so create-or-replace preserves grants;
-- restated anyway so this file stands alone.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- shop_directory: is_online -> shop_status, and 'closing' shops drop out of
-- the directory entirely. Return type changes (column swapped, not just
-- renamed at the SQL level) so this needs DROP + recreate, same trap as every
-- earlier change to this function's shape.
--
-- The exclusion lives in `matched`, upstream of both the page and
-- total_count — the 0019/0023/0028 versions would have undercounted pages
-- once one shop stops matching, since total_count there was computed from the
-- same `matched` set, but this filter didn't exist yet to be missed.
-- ---------------------------------------------------------------------------
drop function if exists shop_directory(int, int, text);

create or replace function shop_directory(
  p_limit  int  default 20,
  p_offset int  default 0,
  p_search text default ''
)
returns table (
  id             uuid,
  name           text,
  handle         text,
  bio            text,
  location       text,
  avatar_url     text,
  banner_url     text,
  shop_status    text,
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
    select least(greatest(coalesce(p_limit, 20), 1), 50) as lim,
           greatest(coalesce(p_offset, 0), 0)            as off
  ),
  q as (
    select nullif(btrim(coalesce(p_search, '')), '') as term
  ),
  matched as (
    select m.*
    from merchants m, q
    where m.shop_status <> 'closing'
      and (
        q.term is null
        or m.name     ilike '%' || q.term || '%'
        or m.handle   ilike '%' || q.term || '%'
        or coalesce(m.bio, '')      ilike '%' || q.term || '%'
        or coalesce(m.location, '') ilike '%' || q.term || '%'
      )
  ),
  page as (
    select mm.* from matched mm
    order by mm.created_at desc, mm.id
    limit  (select lim from bounds)
    offset (select off from bounds)
  )
  select
    p.id, p.name, p.handle,
    coalesce(p.bio, ''), coalesce(p.location, ''),
    coalesce(p.avatar_url, ''), coalesce(p.banner_url, ''),
    p.shop_status,
    coalesce(p.whatsapp, ''), coalesce(p.instagram, ''), coalesce(p.facebook, ''),
    coalesce(pc.cnt, 0),
    coalesce(oc.cnt, 0),
    coalesce(fc.cnt, 0),
    coalesce(pc.avg_rating, 0),
    coalesce(pv.previews, '[]'::jsonb),
    (select count(*) from matched)
  from page p
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
  left join lateral (
    select jsonb_agg(
             jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'image', t.image)
             order by t.created_at desc
           ) as previews
    from (
      select pr.id, pr.name, pr.slug, pr.images[1] as image, pr.created_at
      from products pr
      where pr.merchant_id = p.id
        and coalesce(array_length(pr.images, 1), 0) > 0
      order by pr.created_at desc
      limit 3
    ) t
  ) pv on true
  order by p.created_at desc, p.id;
$$;

revoke execute on function shop_directory(int, int, text) from public;
grant  execute on function shop_directory(int, int, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- SEO surfaces: a 'closing' shop and its products stop being addressable by a
-- crawler — render.ts treats a null seo_shop()/seo_product() result as a 404,
-- and the sitemap RPCs simply omit the rows, so nothing has to change in
-- api/render.ts or api/sitemap.ts.
--
-- All four keep their existing signature and return type, so create-or-
-- replace preserves grants; restated anyway so this file stands alone.
-- ---------------------------------------------------------------------------
create or replace function seo_shop(p_handle text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'name',            m.name,
    'handle',          m.handle,
    'tagline',         coalesce(m.tagline, ''),
    'bio',             coalesce(m.bio, ''),
    'location',        coalesce(m.location, ''),
    'metaDescription', coalesce(m.meta_description, ''),
    'avatarUrl',       coalesce(m.avatar_url, ''),
    'bannerUrl',       coalesce(m.banner_url, ''),
    'updatedAt',       m.updated_at,
    'productCount',    (select count(*) from products pr where pr.merchant_id = m.id),
    'categories',      coalesce((
      select jsonb_agg(distinct pr.category order by pr.category)
      from products pr where pr.merchant_id = m.id
    ), '[]'::jsonb)
  )
  from merchants m
  where m.handle = lower(btrim(p_handle))
    and m.shop_status <> 'closing'
  limit 1;
$$;

revoke execute on function seo_shop(text) from public;
grant  execute on function seo_shop(text) to anon, authenticated;

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
    and m.shop_status <> 'closing'
  limit 1;
$$;

revoke execute on function seo_product(text, text) from public;
grant  execute on function seo_product(text, text) to anon, authenticated;

create or replace function seo_sitemap_shops(p_limit int default 1000, p_offset int default 0)
returns table (handle text, updated_at timestamptz, total_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select least(greatest(coalesce(p_limit, 1000), 1), 5000) as lim,
           greatest(coalesce(p_offset, 0), 0)                as off
  ),
  listed as (
    select m.handle, m.updated_at, m.created_at, m.id
    from merchants m
    where m.shop_status <> 'closing'
      and exists (select 1 from products pr where pr.merchant_id = m.id)
  )
  select l.handle, l.updated_at, (select count(*) from listed)
  from listed l
  order by l.created_at desc, l.id
  limit (select lim from bounds) offset (select off from bounds);
$$;

revoke execute on function seo_sitemap_shops(int, int) from public;
grant  execute on function seo_sitemap_shops(int, int) to anon, authenticated;

create or replace function seo_sitemap_products(p_limit int default 1000, p_offset int default 0)
returns table (handle text, slug text, image text, updated_at timestamptz, total_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select least(greatest(coalesce(p_limit, 1000), 1), 5000) as lim,
           greatest(coalesce(p_offset, 0), 0)                as off
  ),
  listed as (
    select m.handle, p.slug, coalesce(p.images[1], '') as image,
           p.updated_at, p.created_at, p.id
    from products p
    join merchants m on m.id = p.merchant_id
    where m.shop_status <> 'closing'
  )
  select l.handle, l.slug, l.image, l.updated_at, (select count(*) from listed)
  from listed l
  order by l.created_at desc, l.id
  limit (select lim from bounds) offset (select off from bounds);
$$;

revoke execute on function seo_sitemap_products(int, int) from public;
grant  execute on function seo_sitemap_products(int, int) to anon, authenticated;
