-- Category pages: the one page type a marketplace ranks with that PulseShop
-- does not have.
--
-- Shop pages win brand queries ("gamerhq"). Product pages win exact-model
-- queries ("nintendo switch 2 nairobi"). Nothing on the domain answers the
-- query in between — "gaming consoles in kenya" — which is the one with volume
-- and the one a shopper who does not yet know the shop actually types. That gap
-- is the whole reason marketplaces build category pages.
--
-- THE TRAP THIS AVOIDS. The naive version generates a page per category in
-- lib/constants.ts and links them all from a footer. With 37 leaf categories
-- and 44 products live, that would ship ~35 near-empty pages — which Google
-- files as "crawled, currently not indexed" and, in bulk, reads as a doorway
-- pattern that drags on every other page on the domain. So the count is
-- returned with the page and the caller refuses to index a category that has
-- too few products, and seo_sitemap_categories only ever lists the ones that
-- clear the bar. Categories become indexable as sellers fill them, which is the
-- right direction for that to move in.
--
-- SLUGS ARE DERIVED, NOT STORED. `products.category` holds the display name
-- ("Gaming Consoles") from the fixed taxonomy in lib/constants.ts. Adding a
-- slug column would mean a second source of truth that can disagree with the
-- taxonomy after an edit. category_slug() below computes it, and its definition
-- is a transliteration of slugify() in lib/slug.ts — lowercase, every run of
-- non-alphanumerics to a dash, dashes trimmed off both ends. The two must
-- agree: the app builds hrefs with one and the server resolves them with the
-- other.

-- immutable so it can be indexed. Marked strict because a null category has no
-- slug and should not become the empty string, which would collide with every
-- other null.
create or replace function category_slug(p_category text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select trim(both '-' from regexp_replace(lower(btrim(p_category)), '[^a-z0-9]+', '-', 'g'));
$$;

-- Resolving /category/:slug is a lookup on the derived value, so it needs an
-- expression index or every category page is a full scan of products.
create index if not exists products_category_slug_idx
  on products(category_slug(category));

-- ---------------------------------------------------------------------------
-- seo_category
-- ---------------------------------------------------------------------------
--
-- Returns null for a slug nothing stocks, which api/render.ts turns into a real
-- 404. That matters more here than elsewhere: category slugs are guessable, so
-- without it every made-up /category/anything would be a 200 with an empty
-- "no products" screen — a soft 404 generator anyone could point a crawler at.
--
-- `shop_count` is not decoration. It is the honest measure of whether a
-- category page has anything to say: 20 products from one shop is that shop's
-- storefront wearing a category's name, and the page adds nothing the
-- storefront does not already do better.
create or replace function seo_category(p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with matched as (
    select p.id, p.name, p.slug, p.category, p.images, p.image_alt, p.created_at,
           p.status, m.handle as shop_handle, m.name as shop_name, m.location,
           effective_price(p.price_kes, p.discount_pct,
             variant_min_adj(p.size_price_adj,  p.sizes)
           + variant_min_adj(p.color_price_adj, p.colors)) as price
    from products p
    join merchants m on m.id = p.merchant_id
    where category_slug(p.category) = lower(btrim(p_slug))
      and m.shop_status <> 'closing'
  )
  select jsonb_build_object(
    'name',         (select category from matched limit 1),
    'slug',         lower(btrim(p_slug)),
    'productCount', (select count(*) from matched),
    'shopCount',    (select count(distinct shop_handle) from matched),
    -- Where the stock is, for the "shops stocking this" links. Ordered by how
    -- much each shop actually has, so the strongest internal link goes to the
    -- storefront most likely to satisfy the click.
    'shops',        coalesce((
      select jsonb_agg(s order by s->>'name')
      from (
        select jsonb_build_object(
                 'name',     shop_name,
                 'handle',   shop_handle,
                 'location', coalesce(location, ''),
                 'count',    count(*)
               ) as s
        from matched
        group by shop_name, shop_handle, location
        order by count(*) desc
        limit 12
      ) t
    ), '[]'::jsonb),
    'products',     coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'name',      t.name,
                 'slug',      t.slug,
                 'price',     t.price,
                 'image',     t.image,
                 'imageAlt',  t.image_alt,
                 'inStock',   t.in_stock,
                 'shopName',  t.shop_name,
                 'shopHandle',t.shop_handle
               )
               order by t.created_at desc, t.id
             )
      from (
        select name, slug, price, created_at, id, shop_name, shop_handle,
               coalesce(images[1], '')    as image,
               coalesce(image_alt[1], '') as image_alt,
               (status <> 'out')          as in_stock
        from matched
        order by created_at desc, id
        limit 24
      ) t
    ), '[]'::jsonb)
  )
  where exists (select 1 from matched);
$$;

revoke execute on function seo_category(text) from public;
grant  execute on function seo_category(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- seo_sitemap_categories
-- ---------------------------------------------------------------------------
--
-- The threshold is a parameter rather than a constant so the one number lives
-- in lib/seo.ts (CATEGORY_MIN_PRODUCTS) and is passed in — a page the sitemap
-- advertises and the renderer then serves noindex is a Search Console error
-- reported against the whole domain, and that is exactly what two copies of
-- this number drifting apart would produce.
create or replace function seo_sitemap_categories(p_min_products int default 3)
returns table (slug text, product_count bigint, updated_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select category_slug(p.category)  as slug,
         count(*)                   as product_count,
         max(p.updated_at)          as updated_at
  from products p
  join merchants m on m.id = p.merchant_id
  where m.shop_status <> 'closing'
    and coalesce(btrim(p.category), '') <> ''
  group by category_slug(p.category)
  having count(*) >= greatest(coalesce(p_min_products, 3), 1)
  order by count(*) desc, 1;
$$;

revoke execute on function seo_sitemap_categories(int) from public;
grant  execute on function seo_sitemap_categories(int) to anon, authenticated;
