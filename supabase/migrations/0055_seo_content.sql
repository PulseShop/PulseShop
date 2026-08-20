-- Data the server renderer needs to put real CONTENT in the page, not just tags.
--
-- Until now api/render.ts served a correct <head> attached to an empty
-- <div id="root"></div>. Googlebot renders JavaScript and eventually sees the
-- app; Bing, DuckDuckGo and the AI answer crawlers largely do not, and even for
-- Google the render is queued behind a budget rather than done on the spot. The
-- practical effect is a site with zero crawlable text and, more importantly,
-- zero <a href> — no internal linking at all, so nothing on the domain passes
-- context or authority to anything else on it.
--
-- Fixing that needs two things the existing RPCs do not return:
--   seo_shop     — the storefront's own products, so the shop page can ship a
--                  real linked product list.
--   seo_product  — rating / review_count / condition, so the Product JSON-LD
--                  can carry an aggregateRating and an itemCondition.
--
-- Both are `create or replace` with an unchanged signature and return type
-- (jsonb), so unlike the DROP + CREATE churn in 0026/0028/0038 the ACL survives
-- and the revoke/grant at the bottom is belt-and-braces rather than load-bearing.
--
-- SECURITY. Same posture as 0028: an explicit field list, no `select *`, and
-- nothing here that a shopper could not already read off the rendered page.
-- Seller contacts stay out. security invoker keeps RLS as the boundary.

-- ---------------------------------------------------------------------------
-- seo_shop: carry the storefront's products.
-- ---------------------------------------------------------------------------
--
-- Capped at 24. The cap is the point, not a detail: this list is rendered into
-- every crawler request for the page, and a shop with 800 products would turn a
-- 6 KB response into a 300 KB one for no ranking benefit — the sitemap already
-- guarantees discovery of the long tail. 24 is roughly one scroll of the real
-- grid, which is what makes it usable as the page's first paint as well.
--
-- Ordered newest-first to match StorefrontPage's default sort. If the two
-- disagreed, the server list and the hydrated list would show different
-- products in a different order, which is the shape of thing that gets read as
-- cloaking even when it is only a missing ORDER BY.
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
    ), '[]'::jsonb),
    'products',        coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'name',     t.name,
                 'slug',     t.slug,
                 'price',    t.price,
                 'image',    t.image,
                 'imageAlt', t.image_alt,
                 'inStock',  t.in_stock
               )
               order by t.created_at desc, t.id
             )
      from (
        select pr.name, pr.slug, pr.created_at, pr.id,
               effective_price(pr.price_kes, pr.discount_pct,
                 variant_min_adj(pr.size_price_adj,  pr.sizes)
               + variant_min_adj(pr.color_price_adj, pr.colors)) as price,
               coalesce(pr.images[1], '')    as image,
               coalesce(pr.image_alt[1], '') as image_alt,
               (pr.status <> 'out')          as in_stock
        from products pr
        where pr.merchant_id = m.id
        order by pr.created_at desc, pr.id
        limit 24
      ) t
    ), '[]'::jsonb)
  )
  from merchants m
  where m.handle = lower(btrim(p_handle))
    and m.shop_status <> 'closing'
  limit 1;
$$;

revoke execute on function seo_shop(text) from public;
grant  execute on function seo_shop(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- seo_product: rating, review count and condition.
-- ---------------------------------------------------------------------------
--
-- 0028 deliberately left aggregateRating out, and its comment ("the reviews
-- table exists but nothing writes to it") was true when written. It no longer
-- is — services/api/reviews.ts upserts, and the verified-buyer constraint means
-- every row behind these two columns is a real order. So the numbers can go out,
-- with the caller gating on review_count > 0 so a product with no reviews still
-- advertises nothing rather than a zero-star rating.
--
-- `condition` is only ever set on phone listings (0037's specs jsonb). Anything
-- else returns '' and the caller omits itemCondition rather than guessing
-- NewCondition, which would be a claim about the goods that no seller made.
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
    'imageAlts',       to_jsonb(coalesce(p.image_alt, '{}'::text[])),
    'minPrice',        effective_price(p.price_kes, p.discount_pct,
                         variant_min_adj(p.size_price_adj,  p.sizes)
                       + variant_min_adj(p.color_price_adj, p.colors)),
    'maxPrice',        effective_price(p.price_kes, p.discount_pct,
                         variant_max_adj(p.size_price_adj,  p.sizes)
                       + variant_max_adj(p.color_price_adj, p.colors)),
    'inStock',         (p.status <> 'out'),
    'rating',          coalesce(p.rating, 0),
    'reviewCount',     coalesce(p.review_count, 0),
    'condition',       coalesce(p.specs->>'condition', ''),
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

-- The shop-products subquery filters on merchant_id and orders by created_at,
-- which is a different access path from products_created_idx (0028) — that one
-- leads on created_at and cannot serve a per-merchant sort.
create index if not exists products_merchant_created_idx
  on products(merchant_id, created_at desc, id);
