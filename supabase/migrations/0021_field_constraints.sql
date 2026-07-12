-- Database-level validation of every user-writable field.
--
-- The app already validates with zod, but zod runs in the *browser* — it is
-- advice, not enforcement. Anyone holding the (public, by-design) anon key can
-- POST straight to PostgREST and skip it. RLS decides *who* may write a row;
-- nothing until now decided *what* a row may contain, so an authenticated
-- merchant could store a 50MB description or a 10k-element images array.
--
-- These are the "what". Length caps are the important half: they bound the
-- payload every public storefront read has to ship, which is the actual abuse
-- vector. The URL scheme checks are defence-in-depth — React already escapes
-- everything it renders, and no user-controlled string reaches an href (see
-- lib/deeplinks.ts, which templates every social link), so this is a second
-- line, not the first.
--
-- Nothing here is a "sanitizer": we reject bad input, we never silently rewrite
-- it. Stripping quotes would corrupt a shop legitimately called O'Brien's, and
-- would buy nothing — supabase-js/PostgREST parameterise every query and no
-- function in this schema builds dynamic SQL, so there is no injection surface
-- to sanitize in the first place.

-- ---------------------------------------------------------------------------
-- Immutable helpers. CHECK constraints reject anything not marked IMMUTABLE
-- (and cannot contain subqueries), so array checks need these.
-- ---------------------------------------------------------------------------
create or replace function text_array_len(arr text[])
returns int
language sql
immutable
set search_path = public
as $$
  select coalesce(sum(length(x)), 0)::int
  from unnest(coalesce(arr, '{}'::text[])) as x;
$$;

create or replace function all_http_urls(arr text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(bool_and(x = '' or x ~ '^https?://'), true)
  from unnest(coalesce(arr, '{}'::text[])) as x;
$$;

-- Both are pure text utilities that read no data. They must stay executable by
-- the roles doing the writing, otherwise every INSERT evaluating the CHECK
-- would fail on a permission error.
grant execute on function text_array_len(text[]) to public;
grant execute on function all_http_urls(text[])  to public;

-- ---------------------------------------------------------------------------
-- merchants
-- ---------------------------------------------------------------------------
alter table merchants
  add constraint merchants_name_len   check (length(btrim(name)) between 1 and 80),
  -- Mirrors SLUG_PATTERN / SLUG_MIN_LENGTH in frontend/src/lib/slug.ts. Also
  -- satisfied by the handles handle_new_user() generates ('shop-<8 hex>') and
  -- by its numeric retry suffix (0007).
  add constraint merchants_handle_fmt check (handle ~ '^[a-z0-9-]{3,32}$'),
  add constraint merchants_bio_len    check (length(coalesce(bio, '')) <= 300),
  add constraint merchants_loc_len    check (length(coalesce(location, '')) <= 80),
  add constraint merchants_wa_len     check (length(coalesce(whatsapp, '')) <= 40),
  add constraint merchants_ig_len     check (length(coalesce(instagram, '')) <= 40),
  add constraint merchants_fb_len     check (length(coalesce(facebook, '')) <= 40),
  add constraint merchants_avatar_url check (
    avatar_url is null or avatar_url = '' or
    (avatar_url ~ '^https?://' and length(avatar_url) <= 600)
  ),
  add constraint merchants_banner_url check (
    banner_url is null or banner_url = '' or
    (banner_url ~ '^https?://' and length(banner_url) <= 600)
  );

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
alter table products
  add constraint products_name_len  check (length(btrim(name)) between 1 and 120),
  add constraint products_sku_len   check (length(btrim(sku)) between 1 and 40),
  add constraint products_cat_len   check (length(btrim(category)) between 1 and 40),
  add constraint products_desc_len  check (length(coalesce(description, '')) <= 2000),
  -- price_kes >= 0 and stock_qty >= 0 already exist (0001); these add the
  -- missing upper bound, so a fat-fingered or scripted write can't store a
  -- 2-billion-shilling product that then overflows every total on the page.
  add constraint products_price_max check (price_kes <= 100000000),
  add constraint products_stock_max check (stock_qty <= 1000000),
  add constraint products_images_n  check (coalesce(array_length(images, 1), 0) <= 8),
  add constraint products_images_len check (text_array_len(images) <= 4000),
  add constraint products_images_url check (all_http_urls(images)),
  add constraint products_sizes_n   check (coalesce(array_length(sizes, 1), 0) <= 20),
  add constraint products_sizes_len check (text_array_len(sizes) <= 400);

-- ---------------------------------------------------------------------------
-- orders — written by place_order() on behalf of guests, so these are the only
-- fields on the schema an unauthenticated caller can put text into.
-- ---------------------------------------------------------------------------
alter table orders
  add constraint orders_cust_name_len  check (length(btrim(customer_name)) between 1 and 80),
  add constraint orders_cust_phone_len check (length(coalesce(customer_phone, '')) <= 30),
  add constraint orders_cust_notes_len check (length(coalesce(customer_notes, '')) <= 500);

-- ---------------------------------------------------------------------------
-- order_items — product_name/image are snapshots copied from products at order
-- time, so they inherit the caps above; qty already has qty > 0.
-- ---------------------------------------------------------------------------
alter table order_items
  add constraint order_items_qty_max check (qty <= 10000);
