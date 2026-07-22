-- SEO foundations: product slugs, seller-controlled search metadata, and a set
-- of narrow read-only RPCs for the server-side renderer.
--
-- WHY THE RPCs EXIST AT ALL, given `merchants public read` and `products public
-- read` already allow `select *` as anon:
--
-- Because the renderer writes what it reads into HTML that Google, Bing and
-- every WhatsApp/Instagram link-preview fetcher will store and republish. That
-- is a one-way door. `select *` on merchants returns the seller's WhatsApp
-- number, Instagram handle and Facebook handle — data that is deliberately
-- public *on a page a human visits*, but that must not be baked into indexable
-- markup, where it becomes bulk-scrapeable and permanently cached by third
-- parties we cannot ask to forget it. The storefront showing a phone number to
-- a shopper who navigated to the shop is not the same act as publishing it in a
-- meta tag.
--
-- So the SEO path gets its own projections, and they list every field
-- explicitly. A future `alter table merchants add column tax_id` cannot leak
-- into a meta tag by accident, which is exactly what would happen if the
-- renderer ran `select *`.
--
-- All of these are SECURITY INVOKER. They need no privilege the caller doesn't
-- already have — the public-read policies cover every row they touch — so they
-- take none. (Contrast shop_directory/merchant_stats in 0019, which are definer
-- only because they must count `orders` and `follows`, whose RLS hides rows
-- from a public visitor. Nothing here counts either.)

-- ---------------------------------------------------------------------------
-- Slugs
--
-- `/gaminghq/30-inch-gaming-monitor` instead of `/product/<uuid>`. The URL path
-- is a stronger relevance signal than the title tag and a UUID carries none;
-- nesting products under their shop is also what tells a crawler "GamingHQ is a
-- store with 40 items" rather than 40 unrelated pages.
-- ---------------------------------------------------------------------------

-- Mirrors slugify() in frontend/src/lib/slug.ts. IMMUTABLE so the CHECK
-- constraint below and the trigger can both use it.
create or replace function slugify_text(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-');
$$;

grant execute on function slugify_text(text) to public;

alter table products add column if not exists slug text;

-- Backfill. row_number() disambiguates a shop that legitimately sells two
-- things with the same name ("black tee" / "Black Tee"), which slugify collapses
-- to one string — without this the unique index below would refuse to build.
with numbered as (
  select
    id,
    coalesce(nullif(left(slugify_text(name), 70), ''), 'item') as base,
    row_number() over (
      partition by merchant_id, coalesce(nullif(left(slugify_text(name), 70), ''), 'item')
      order by created_at, id
    ) as n
  from products
  where slug is null
)
update products p
set slug = case when n.n = 1 then n.base else n.base || '-' || n.n end
from numbered n
where p.id = n.id;

/**
 * Fill in a missing slug, and normalise one the seller typed.
 *
 * Deliberately only assigns when slug IS NULL. Renaming a product must NOT
 * change its URL: by the time a seller fixes a typo in a name, that URL may be
 * indexed, shared in a WhatsApp group and sitting in someone's order history.
 * Silently rotating it turns all of those into 404s. Sellers can still change a
 * slug explicitly (the UI warns them); this trigger just never does it for them.
 */
create or replace function set_product_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_base text;
  v_slug text;
  v_n    int := 0;
begin
  -- A seller-supplied slug is normalised, never rejected outright; if
  -- normalising empties it (a name of pure punctuation, say) fall through to
  -- deriving one.
  if new.slug is not null then
    new.slug := nullif(left(slugify_text(new.slug), 80), '');
  end if;

  if new.slug is null then
    v_base := coalesce(nullif(left(slugify_text(new.name), 70), ''), 'item');
    v_slug := v_base;
    while exists (
      select 1 from products p
      where p.merchant_id = new.merchant_id and p.slug = v_slug and p.id <> new.id
    ) loop
      v_n := v_n + 1;
      -- Pathological case (50 products named the same thing): stop scanning and
      -- take a random suffix rather than loop against a hostile insert pattern.
      if v_n > 50 then
        v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
        exit;
      end if;
      v_slug := v_base || '-' || v_n;
    end loop;
    new.slug := v_slug;
  end if;

  return new;
end;
$$;

-- Trigger functions must not be callable as RPCs (0015 established this).
revoke execute on function set_product_slug() from public, anon, authenticated;

drop trigger if exists products_set_slug on products;
create trigger products_set_slug
  before insert or update of slug, name on products
  for each row execute function set_product_slug();

alter table products alter column slug set not null;

alter table products drop constraint if exists products_slug_fmt;
alter table products add constraint products_slug_fmt
  check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$');

-- Unique per shop, not globally: two different shops may both sell a
-- "black-hoodie", and the URL carries the shop handle so they never collide.
create unique index if not exists products_merchant_slug_idx
  on products(merchant_id, slug);

-- ---------------------------------------------------------------------------
-- Seller-controlled search metadata
--
-- One controlled slot each, NOT a free-text title. Letting a seller author the
-- whole <title> invites keyword stuffing ("cheap monitor buy now nairobi best
-- price"), which search engines demote — and because every shop lives on one
-- domain, one seller's spam drags down every other shop on pulseshop.space.
-- The title is generated from a template; these fill in the parts only the
-- seller knows.
--
-- Lengths match what actually renders: ~60 chars before Google truncates a
-- title, ~155 before it truncates a description.
-- ---------------------------------------------------------------------------
alter table merchants
  add column if not exists tagline          text,
  add column if not exists meta_description text;

alter table products
  add column if not exists meta_description text;

alter table merchants
  drop constraint if exists merchants_tagline_len,
  drop constraint if exists merchants_meta_desc_len;
alter table merchants
  add constraint merchants_tagline_len   check (tagline is null or length(tagline) <= 60),
  add constraint merchants_meta_desc_len check (meta_description is null or length(meta_description) <= 160);

alter table products drop constraint if exists products_meta_desc_len;
alter table products add constraint products_meta_desc_len
  check (meta_description is null or length(meta_description) <= 160);

-- ---------------------------------------------------------------------------
-- search_products: return the slug so every grid can link canonically.
--
-- Return type changes ⇒ DROP and recreate (create-or-replace cannot), which
-- resets the ACL to execute-to-public. The revoke/grant at the bottom is
-- load-bearing, not ceremony — same trap as 0022, 0023, 0026 and 0027.
-- ---------------------------------------------------------------------------
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
  p_colors      text[] default null
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

revoke execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[]) from public;
grant  execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- shop_directory: the embedded preview thumbnails link to products, so they
-- need the slug too. Signature is unchanged, so create-or-replace keeps the
-- 0023 grants — restated at the bottom anyway so this file stands alone.
-- ---------------------------------------------------------------------------
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
    select least(greatest(coalesce(p_limit, 20), 1), 50) as lim,
           greatest(coalesce(p_offset, 0), 0)            as off
  ),
  q as (
    select nullif(btrim(coalesce(p_search, '')), '') as term
  ),
  matched as (
    select m.*
    from merchants m, q
    where q.term is null
       or m.name     ilike '%' || q.term || '%'
       or m.handle   ilike '%' || q.term || '%'
       or coalesce(m.bio, '')      ilike '%' || q.term || '%'
       or coalesce(m.location, '') ilike '%' || q.term || '%'
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
    p.is_online,
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
-- seo_shop: everything the renderer needs for a storefront page, and nothing
-- else.
--
-- Note what is absent: whatsapp, instagram, facebook, id, created_at, and the
-- order/follower counts. The contact fields are the point (see the header
-- note) — the rest are simply not needed to render a title, a description, an
-- OG card or a Store JSON-LD block, and anything not needed is not published.
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
  limit 1;
$$;

revoke execute on function seo_shop(text) from public;
grant  execute on function seo_shop(text) to anon, authenticated;

-- The dearest a product can be, for the "from X" / price-range half of an
-- offers block. 0027 defined only the min; the max lived in lib/currency.ts
-- alone, which meant no server-side surface could state a range. Defined before
-- seo_product because `language sql` bodies are parsed at CREATE time.
create or replace function variant_max_adj(p_map jsonb, p_options text[])
returns int
language sql
immutable
set search_path = public
as $$
  select coalesce(
    (select max(coalesce((p_map ->> o)::int, 0))
     from unnest(coalesce(p_options, '{}'::text[])) o),
    0);
$$;

grant execute on function variant_max_adj(jsonb, text[]) to public;

-- ---------------------------------------------------------------------------
-- seo_product: one product, addressed the way its canonical URL addresses it.
--
-- Prices come back as the same min/max the grid shows, computed by
-- effective_price() — so the number in the JSON-LD `offers` block is the number
-- the shopper is charged. Publishing a price to Google that the checkout then
-- contradicts is a policy violation on their side and a trust problem on ours.
--
-- Availability is a boolean, not stock_qty. The exact unit count is
-- competitively sensitive and a crawler has no use for it.
-- ---------------------------------------------------------------------------
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
  limit 1;
$$;

revoke execute on function seo_product(text, text) from public;
grant  execute on function seo_product(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- seo_product_url_by_id: where a legacy /product/<uuid> link should now point.
--
-- Those URLs are in WhatsApp threads, order confirmations and browser histories
-- and will keep being fetched for years, so the renderer 301s them to the
-- canonical slug URL. Returns the two path segments and nothing else — a
-- redirect target needs no product data, so it gets none.
-- ---------------------------------------------------------------------------
create or replace function seo_product_url_by_id(p_id uuid)
returns table (handle text, slug text)
language sql
stable
security invoker
set search_path = public
as $$
  select m.handle, p.slug
  from products p
  join merchants m on m.id = p.merchant_id
  where p.id = p_id
  limit 1;
$$;

revoke execute on function seo_product_url_by_id(uuid) from public;
grant  execute on function seo_product_url_by_id(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sitemap sources.
--
-- Paginated and hard-clamped: a sitemap endpoint that returns "every row" is a
-- free full-table scan for anyone who curls it in a loop.
--
-- Shops with no products are excluded on purpose. An empty storefront is a thin
-- page; submitting a pile of them invites a "crawled, currently not indexed"
-- verdict that costs the shops which DO have stock.
-- ---------------------------------------------------------------------------
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
    where exists (select 1 from products pr where pr.merchant_id = m.id)
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
  )
  select l.handle, l.slug, l.image, l.updated_at, (select count(*) from listed)
  from listed l
  order by l.created_at desc, l.id
  limit (select lim from bounds) offset (select off from bounds);
$$;

revoke execute on function seo_sitemap_products(int, int) from public;
grant  execute on function seo_sitemap_products(int, int) to anon, authenticated;

-- Both sitemap queries and seo_product order/filter on these.
create index if not exists products_created_idx on products(created_at desc, id);
