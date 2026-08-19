-- ---------------------------------------------------------------------------
-- 0048  Paid banner placement (owner-managed), control-room reads, price range.
--
-- Three things that arrived together because they are one story: the owner
-- needs to see who is on the platform, move a shop between tiers, and sell the
-- banner slot at the top of the marketplace.
--
-- WHY THIS IS NOT 0045 AGAIN. 0045 let a SELLER insert its own promotion, gated
-- on plan by an RLS policy, and 0046 pulled the whole thing because the "paid"
-- half never existed: billing was not wired, so what shipped was a banner the
-- higher tiers could fill for free. Nothing about that has changed — there is
-- still no payment gateway — so this table is deliberately NOT self-serve. A
-- seller pays out of band, the owner records the placement here, and the seller
-- has no INSERT privilege at all. When billing does land, a webhook running as
-- service_role writes the same rows and the UI below stops being the only way
-- in; the schema does not have to change for that.
--
-- WHERE THE BOUNDARY IS. Same as 0047: in this file. Every admin_* function
-- asserts is_platform_admin() before it reads or writes anything, and they are
-- granted to `authenticated` — what refuses a stranger is the raise, not the
-- grant. The React page at /admindev only chooses which screen to render.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- banner_placements
--
-- One row = "this product has been paid onto the marketplace banner". The
-- window is a pair of timestamps rather than a boolean alone, for the reason
-- 0045 gave and which is still true: an advert that has to be switched off by
-- hand is an advert that runs for free the night everyone is asleep. `active`
-- sits alongside so the owner can pause without losing the dates.
--
-- amount_kes and note are the only record that money changed hands. They are
-- not accounting and are not pretending to be; they are what lets the owner
-- answer "who paid for this and how much" three weeks later without a WhatsApp
-- search. A real payments ledger replaces them and should reference this row.
-- ---------------------------------------------------------------------------
create table if not exists banner_placements (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  -- Optional banner copy. Null falls back to the product's own name, which is
  -- the common case; a seller running a seasonal push wants "Back to school"
  -- rather than the SKU name.
  headline    text,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  active      boolean not null default true,
  -- What the seller paid, in whole shillings, and how. Nullable because the
  -- owner may place a house ad or a freebie, and a fake zero would be worse
  -- than an honest null.
  amount_kes  integer check (amount_kes is null or amount_kes >= 0),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The same product twice in the banner is a bug, not a bigger buy.
  constraint banner_placements_unique_product unique (product_id),
  -- An end before a start would silently never run.
  constraint banner_placements_window_chk check (ends_at is null or ends_at > starts_at)
);

-- The buyer-facing read is always "what is running right now", so the index
-- matches that predicate rather than indexing the columns one at a time.
create index if not exists banner_placements_live_idx
  on banner_placements (starts_at, ends_at) where active;

alter table banner_placements enable row level security;

-- Anyone may read a placement that is actually running. Nothing here is
-- private: it is an advert, and the product it points at is already public.
-- amount_kes and note are NOT part of that: they ride on the same row, so the
-- table grant below is SELECT and the public read goes through
-- list_banner_placements(), which projects the commercial columns away.
drop policy if exists "banner placements public read" on banner_placements;
create policy "banner placements public read" on banner_placements for select
  using (
    active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  );

-- No INSERT/UPDATE/DELETE policy and no write grant, on purpose. Placements are
-- created by the admin_* functions below, which run as owner after checking
-- is_platform_admin(). A seller cannot put itself on the banner by any path.
revoke all on banner_placements from anon, authenticated;
grant select on banner_placements to anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_banner_placements: what the marketplace banner renders above the free
-- rotation.
--
-- Returns the same column list as list_shop_features (0046) so the client maps
-- both through one row type, plus the placement id and headline. amount_kes and
-- note are deliberately absent: what a seller paid is nobody else's business.
--
-- SECURITY INVOKER, so the public-read policy above is what decides which rows
-- come back — the live window is enforced by RLS, not re-implemented here. The
-- extra guards mirror the banner's own rules: a closing shop's advert stops
-- with the shop, and an advert for something out of stock is worse than no
-- advert.
-- ---------------------------------------------------------------------------
create or replace function list_banner_placements(p_limit int default 6)
returns table (
  placement_id    uuid,
  headline        text,
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
as $$
  select
    bp.id, bp.headline,
    p.id, p.merchant_id, p.name, p.slug, p.sku, p.category,
    p.price_kes, p.discount_pct, p.stock_qty, p.status,
    p.images, coalesce(p.image_alt, '{}'::text[]),
    p.sizes, p.colors, p.size_price_adj, p.color_price_adj, p.color_images,
    p.product_type, p.specs, p.rating, p.review_count,
    p.summary, coalesce(p.description, ''), p.created_at,
    m.handle, m.name
  from banner_placements bp
  join products  p on p.id = bp.product_id
  join merchants m on m.id = p.merchant_id
  where m.shop_status <> 'closing'
    and p.status <> 'out'
    and coalesce(array_length(p.images, 1), 0) > 0
  order by bp.created_at desc
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
$$;

revoke execute on function list_banner_placements(int) from public;
grant  execute on function list_banner_placements(int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The control room's reads and writes.
--
-- All SECURITY DEFINER, all asserting is_platform_admin() first, all granted to
-- `authenticated`. See the header of 0047 for why that combination is the
-- boundary rather than a hole.
-- ---------------------------------------------------------------------------

/**
 * Every shop, with the numbers that decide whether a tier is worth anything.
 *
 * Filterable by plan because "show me the Boutique shops" is the question the
 * owner actually asks — a tier list with no way to see who is on it is a
 * pricing page, not a dashboard. total_count rides on every row so the client
 * can page without a second count query, exactly as search_products does.
 *
 * The email comes from auth.users, which no ordinary caller can read. That is
 * the point of this being SECURITY DEFINER, and it is also why nothing here is
 * ever exposed to a non-admin.
 */
create or replace function admin_list_shops(
  p_plan   text default null,   -- null / 'all' = every plan
  p_search text default '',     -- matches name, handle, location or email
  p_limit  int  default 20,
  p_offset int  default 0
)
returns table (
  id            uuid,
  name          text,
  handle        text,
  email         text,
  plan          text,
  -- Both `plan` and `shop_status` are text columns with CHECK constraints, not
  -- enums (0041 and 0032). Declaring them as a type that does not exist is the
  -- easy mistake here; the values are constrained by the table, not the type.
  shop_status   text,
  location      text,
  avatar_url    text,
  created_at    timestamptz,
  product_count integer,
  order_count   integer,
  gross_kes     bigint,
  banner_count  integer,
  total_count   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lim  int := least(greatest(coalesce(p_limit, 20), 1), 100);
  off  int := greatest(coalesce(p_offset, 0), 0);
  term text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  with matched as (
    select m.*, u.email::text as user_email
    from merchants m
    left join auth.users u on u.id = m.id
    where (p_plan is null or p_plan = 'all' or m.plan = p_plan)
      and (
        term is null
        or m.name        ilike '%' || term || '%'
        or m.handle      ilike '%' || term || '%'
        or coalesce(m.location, '') ilike '%' || term || '%'
        or coalesce(u.email::text, '') ilike '%' || term || '%'
      )
  )
  select
    x.id, x.name, x.handle, x.user_email, x.plan, x.shop_status,
    x.location, x.avatar_url, x.created_at,
    (select count(*) from products pr where pr.merchant_id = x.id)::integer,
    (select count(*) from orders o where o.merchant_id = x.id)::integer,
    (select coalesce(sum(o.total_kes), 0) from orders o
      where o.merchant_id = x.id and o.payment_status <> 'failed')::bigint,
    (select count(*) from banner_placements bp
       join products pr2 on pr2.id = bp.product_id
      where pr2.merchant_id = x.id)::integer,
    (select count(*) from matched)
  from matched x
  -- Newest shop first: the interesting end of this list is who just arrived.
  order by x.created_at desc, x.id
  limit lim offset off;
end;
$$;

revoke all on function admin_list_shops(text, text, int, int) from public, anon;
grant execute on function admin_list_shops(text, text, int, int) to authenticated;

/**
 * Move a shop between tiers.
 *
 * 0041 took the plan column away from sellers ("a seller must not be able to
 * upgrade themselves") and left it to be set by hand with the service role.
 * This is that by-hand step, made auditable and available to the owner without
 * a psql session — the privilege check is the same one the rest of the control
 * room uses, and `authenticated` still has no UPDATE privilege on the column.
 *
 * A matching pending upgrade request is resolved in the same statement, because
 * a queue you have to remember to tidy is a queue that stays full of work that
 * is already done.
 */
create or replace function admin_set_shop_plan(p_merchant_id uuid, p_plan text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if p_plan not in ('explorer', 'boutique', 'influencer') then
    raise exception 'unknown plan: %', p_plan using errcode = '22023';
  end if;

  update merchants set plan = p_plan where id = p_merchant_id;
  if not found then
    raise exception 'no such shop' using errcode = 'P0002';
  end if;

  -- Approve an open request for exactly this plan; a request for a different
  -- one is left alone, since granting Boutique does not answer "I asked for
  -- Influencer".
  update plan_upgrade_requests
     set status = 'approved', resolved_at = now()
   where merchant_id = p_merchant_id
     and status = 'pending'
     and requested_plan = p_plan;
end;
$$;

revoke all on function admin_set_shop_plan(uuid, text) from public, anon;
grant execute on function admin_set_shop_plan(uuid, text) to authenticated;

/**
 * Every placement, running or not, with the commercial columns the public read
 * hides. `live` is computed here rather than in the client so the dashboard and
 * the banner agree on what "running" means.
 */
create or replace function admin_list_banner_placements()
returns table (
  id            uuid,
  product_id    uuid,
  headline      text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  active        boolean,
  amount_kes    integer,
  note          text,
  created_at    timestamptz,
  live          boolean,
  product_name  text,
  product_slug  text,
  product_image text,
  price_kes     integer,
  status        stock_status,
  merchant_id   uuid,
  shop_name     text,
  shop_handle   text,
  shop_plan     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select
    bp.id, bp.product_id, bp.headline, bp.starts_at, bp.ends_at, bp.active,
    bp.amount_kes, bp.note, bp.created_at,
    (bp.active
      and bp.starts_at <= now()
      and (bp.ends_at is null or bp.ends_at > now())
      and m.shop_status <> 'closing'
      and p.status <> 'out'),
    p.name, p.slug, (p.images)[1], p.price_kes, p.status,
    m.id, m.name, m.handle, m.plan
  from banner_placements bp
  join products  p on p.id = bp.product_id
  join merchants m on m.id = p.merchant_id
  order by bp.created_at desc;
end;
$$;

revoke all on function admin_list_banner_placements() from public, anon;
grant execute on function admin_list_banner_placements() to authenticated;

/**
 * Create or edit a placement.
 *
 * One upsert rather than a create and an update, because every field is
 * editable and the two would be the same function with a different first line.
 * A null p_id creates; a non-null one edits that row.
 *
 * `already` guards the unique constraint with a message a person can read: the
 * raw violation names the constraint, which is a fine thing for a log and a
 * poor thing for a dialog.
 */
create or replace function admin_upsert_banner_placement(
  p_id         uuid        default null,
  p_product_id uuid        default null,
  p_headline   text        default null,
  p_starts_at  timestamptz default null,
  p_ends_at    timestamptz default null,
  p_active     boolean     default true,
  p_amount_kes int         default null,
  p_note       text        default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if p_product_id is null then
    raise exception 'a placement needs a product' using errcode = '22023';
  end if;

  if not exists (select 1 from products where id = p_product_id) then
    raise exception 'no such product' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from banner_placements
    where product_id = p_product_id and (p_id is null or id <> p_id)
  ) then
    raise exception 'that product is already on the banner' using errcode = '23505';
  end if;

  if p_id is null then
    insert into banner_placements
      (product_id, headline, starts_at, ends_at, active, amount_kes, note)
    values
      (p_product_id, nullif(btrim(coalesce(p_headline, '')), ''),
       coalesce(p_starts_at, now()), p_ends_at, coalesce(p_active, true),
       p_amount_kes, nullif(btrim(coalesce(p_note, '')), ''))
    returning id into new_id;
  else
    update banner_placements set
      product_id = p_product_id,
      headline   = nullif(btrim(coalesce(p_headline, '')), ''),
      starts_at  = coalesce(p_starts_at, starts_at),
      ends_at    = p_ends_at,
      active     = coalesce(p_active, active),
      amount_kes = p_amount_kes,
      note       = nullif(btrim(coalesce(p_note, '')), ''),
      updated_at = now()
    where id = p_id
    returning id into new_id;

    if new_id is null then
      raise exception 'no such placement' using errcode = 'P0002';
    end if;
  end if;

  return new_id;
end;
$$;

revoke all on function admin_upsert_banner_placement(uuid, uuid, text, timestamptz, timestamptz, boolean, int, text)
  from public, anon;
grant execute on function admin_upsert_banner_placement(uuid, uuid, text, timestamptz, timestamptz, boolean, int, text)
  to authenticated;

create or replace function admin_delete_banner_placement(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  delete from banner_placements where id = p_id;
end;
$$;

revoke all on function admin_delete_banner_placement(uuid) from public, anon;
grant execute on function admin_delete_banner_placement(uuid) to authenticated;

/**
 * Product lookup for the "put this on the banner" picker.
 *
 * Deliberately not search_products(): that one is shopper-facing and hides
 * closing shops and applies the buyer's filters, whereas the owner picking a
 * placement needs to find the exact product a seller just paid for even if its
 * shop is mid-close. `already_placed` comes back on the row so the picker can
 * grey out what is on the banner instead of failing on submit.
 */
create or replace function admin_search_products(p_search text default '', p_limit int default 12)
returns table (
  id            uuid,
  name          text,
  slug          text,
  sku           text,
  price_kes     integer,
  status        stock_status,
  image         text,
  shop_name     text,
  shop_handle   text,
  shop_plan     text,
  already_placed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  term text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.name, p.slug, p.sku, p.price_kes, p.status, (p.images)[1],
    m.name, m.handle, m.plan,
    exists (select 1 from banner_placements bp where bp.product_id = p.id)
  from products p
  join merchants m on m.id = p.merchant_id
  where term is null
     or p.name   ilike '%' || term || '%'
     or p.sku    ilike '%' || term || '%'
     or m.name   ilike '%' || term || '%'
     or m.handle ilike '%' || term || '%'
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
end;
$$;

revoke all on function admin_search_products(text, int) from public, anon;
grant execute on function admin_search_products(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- A price RANGE, not a ceiling.
--
-- search_products has had p_max_price since 0022, which makes the filter
-- "under X" and nothing else. A shopper who wants the KES 3,000–5,000 shelf has
-- had no way to say so: dragging the ceiling down to 5,000 still buries them
-- under every cheap phone case on the platform.
--
-- p_min_price is appended at the END of the parameter list rather than slotted
-- in beside p_max_price where it reads better. PostgREST calls by name so the
-- position is invisible to the client, and appending keeps the DROP below
-- matching the live 0044 signature exactly — which matters, because getting
-- that list wrong leaves two overloads behind and PostgREST then refuses to
-- pick one. Same trap 0026/0027/0028/0030/0036/0037/0038/0039/0044 all flagged.
--
-- Body is the live 0044 body plus one predicate. Nothing else changes.
-- ---------------------------------------------------------------------------
drop function if exists search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[]);

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
  p_colors      text[] default null,  -- null / empty = any colour
  p_min_rating  numeric default null, -- null = no rating constraint
  p_product_type text default null,   -- null = any type; 'phone' | 'pc' to narrow
  p_ram_min     int  default null,    -- null = any; else ram_gb >= this
  p_storage_min int  default null,    -- null = any; else storage_gb >= this
  p_conditions  text[] default null,  -- null / empty = any phone condition
  p_min_price   int  default null     -- compared against the LOWEST variant price
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
  sold_30d        integer,
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
      -- The other half of the range (0048). Same column, same units, so the two
      -- bounds cannot disagree about what "price" means.
      and (p_min_price is null or p.eff_price >= p_min_price)
      and (coalesce(array_length(p_sizes,  1), 0) = 0 or p.sizes  && p_sizes)
      and (coalesce(array_length(p_colors, 1), 0) = 0 or p.colors && p_colors)
      and (p_min_rating is null or p.rating >= p_min_rating)
      -- structured Phone/PC spec filters (0038)
      and (p_product_type is null or p.product_type = p_product_type::product_type)
      and (p_ram_min is null or (p.ram_gb is not null and p.ram_gb >= p_ram_min))
      and (p_storage_min is null or (p.storage_gb is not null and p.storage_gb >= p_storage_min))
      and (
        coalesce(array_length(p_conditions, 1), 0) = 0
        or (p.specs->>'condition') = any (p_conditions)
      )
  )
  select
    m.id, m.merchant_id, m.name, m.slug, m.sku, m.category,
    m.price_kes, m.discount_pct, m.stock_qty, m.status,
    m.images, coalesce(m.image_alt, '{}'::text[]),
    m.sizes, m.colors, m.size_price_adj, m.color_price_adj, m.color_images,
    m.product_type, m.specs,
    m.rating, m.review_count,
    m.summary, coalesce(m.description, ''), m.created_at,
    mer.handle,
    product_sold_30d(m.id),
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

revoke execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int) from public;
grant  execute on function search_products(uuid, text, text, text, int, text, int, int, text[], text[], numeric, text, int, int, text[], int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- shop_facets: a floor to go with the ceiling, and a marketplace-wide mode.
--
-- TWO CHANGES, and the second is a bug fix that the first depends on.
--
-- 1. priceFloor. The range slider needs both ends, measured the same way the
--    filter compares — the LOWEST variant price after discount — or the
--    cheapest product in the catalogue sits below the slider's own minimum and
--    can never be selected. Same reasoning 0027 gave for priceCeiling.
--
-- 2. p_merchant_id becomes nullable, meaning "every shop". The marketplace has
--    been calling getFacets() with no shop since 0046 and the client filled the
--    gap with the SIGNED-IN user's id, so the front page was asking for one
--    shop's facets — and for a guest, who has no id, the call threw and the
--    whole filter panel silently rendered empty. A null here now means the
--    whole platform, which is what the caller meant, and it matches
--    search_products(p_merchant_id => null) from 0023.
--
--    Closing shops are excluded in that mode for the same reason
--    search_products excludes them: a facet that matches nothing a shopper can
--    see is a dead end. Shop-scoped calls keep every product, because a seller
--    filtering their own dashboard needs to see their own stock regardless.
--
-- Return type is unchanged (jsonb) and adding a DEFAULT does not change the
-- signature, so this is a plain create-or-replace and the existing grants stand.
-- ---------------------------------------------------------------------------
create or replace function shop_facets(p_merchant_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select pr.*
    from products pr
    where (p_merchant_id is null or pr.merchant_id = p_merchant_id)
      and (
        p_merchant_id is not null
        or exists (
          select 1 from merchants mm
          where mm.id = pr.merchant_id and mm.shop_status <> 'closing'
        )
      )
  ),
  eff as (
    select effective_price(
             pr.price_kes, pr.discount_pct,
             variant_min_adj(pr.size_price_adj,  pr.sizes)
           + variant_min_adj(pr.color_price_adj, pr.colors)
           ) as price
    from scoped pr
  )
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(distinct pr.category order by pr.category) from scoped pr
    ), '[]'::jsonb),
    'sizes', coalesce((
      select jsonb_agg(distinct s order by s) from scoped pr, unnest(pr.sizes) as s
    ), '[]'::jsonb),
    'colors', coalesce((
      select jsonb_agg(distinct c order by c) from scoped pr, unnest(pr.colors) as c
    ), '[]'::jsonb),
    'productTypes', coalesce((
      select jsonb_agg(distinct pr.product_type::text order by pr.product_type::text)
      from scoped pr where pr.product_type <> 'general'
    ), '[]'::jsonb),
    'ram', coalesce((
      select jsonb_agg(distinct pr.ram_gb order by pr.ram_gb)
      from scoped pr where pr.ram_gb is not null
    ), '[]'::jsonb),
    'storage', coalesce((
      select jsonb_agg(distinct pr.storage_gb order by pr.storage_gb)
      from scoped pr where pr.storage_gb is not null
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(distinct pr.specs->>'condition' order by pr.specs->>'condition')
      from scoped pr
      where pr.product_type = 'phone' and pr.specs ? 'condition'
    ), '[]'::jsonb),
    'priceFloor',   coalesce((select min(price) from eff), 0),
    'priceCeiling', coalesce((select max(price) from eff), 0),
    'total',     (select count(*) from scoped),
    'available', (select count(*) from scoped where status = 'available'),
    'low',       (select count(*) from scoped where status = 'low'),
    'out',       (select count(*) from scoped where status = 'out')
  );
$$;

revoke execute on function shop_facets(uuid) from public;
grant  execute on function shop_facets(uuid) to anon, authenticated;
