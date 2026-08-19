-- ---------------------------------------------------------------------------
-- 0049  Banner rotation: the order the marketplace hero cycles placements in.
--
-- WHAT CHANGED AND WHY. Multiple placements have been sellable since 0048 --
-- the unique constraint is per PRODUCT, not a global "one row" -- but the
-- marketplace rendered them as a static strip of three, ordered by created_at
-- desc. That made the second and third slot worth visibly less than the first
-- and the fourth worth nothing at all, which is a poor thing to be selling.
--
-- The hero is a carousel now: every live placement gets the whole slide, in
-- turn, on a twelve-second timer. That turns "which slot did I buy" into "where
-- am I in the rotation", and a rotation needs an order somebody chose.
-- created_at desc is not that order -- it means the newest advert always leads,
-- so a seller's position silently degrades every time someone else books.
-- Hence sort_order: explicit, owner-controlled, and the only thing the front
-- page sorts on.
--
-- Nothing here loosens who may write. Placements are still owner-only through
-- the admin_* functions; a seller still has no INSERT privilege on the table.
-- ---------------------------------------------------------------------------

alter table banner_placements
  add column if not exists sort_order integer not null default 0;

-- The read is "everything live, in rotation order", so the index carries the
-- ordering rather than only the predicate.
create index if not exists banner_placements_order_idx
  on banner_placements (sort_order, created_at);

-- ---------------------------------------------------------------------------
-- The public read.
--
-- Same columns as 0048 -- the client's row mapping is untouched -- with two
-- changes: rotation order, and a default limit of 12 rather than 6. The cap was
-- already 12; the default was the number that fit the old three-across strip,
-- and a carousel has no such shape constraint. A cap still exists, because an
-- advert rail nobody will sit through is not inventory, it is a queue.
-- ---------------------------------------------------------------------------
create or replace function list_banner_placements(p_limit int default 12)
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
as $fn$
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
  order by bp.sort_order, bp.created_at
  limit least(greatest(coalesce(p_limit, 12), 1), 12);
$fn$;

revoke execute on function list_banner_placements(int) from public;
grant  execute on function list_banner_placements(int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The owner's list, now carrying sort_order.
--
-- Dropped and recreated rather than replaced: CREATE OR REPLACE cannot change a
-- function's return type, and this one gains a column.
-- ---------------------------------------------------------------------------
drop function if exists admin_list_banner_placements();

create function admin_list_banner_placements()
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
  sort_order    integer,
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
as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select
    bp.id, bp.product_id, bp.headline, bp.starts_at, bp.ends_at, bp.active,
    bp.amount_kes, bp.note, bp.created_at, bp.sort_order,
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
  -- The order the owner sees is the order the hero rotates in. A list sorted
  -- differently from the carousel would make the reorder controls lie about
  -- what they do.
  order by bp.sort_order, bp.created_at;
end;
$fn$;

revoke all on function admin_list_banner_placements() from public, anon;
grant execute on function admin_list_banner_placements() to authenticated;

-- ---------------------------------------------------------------------------
-- Create or edit, now taking a position.
--
-- The old eight-argument signature is dropped rather than left alongside:
-- adding a defaulted parameter creates an OVERLOAD, and two functions differing
-- only by a trailing default are an ambiguity waiting to be resolved the wrong
-- way by whichever caller forgets the new argument.
--
-- A new placement with no position given goes to the END of the rotation, not
-- the front. Booking an advert should not demote everyone who booked earlier,
-- and the owner can move it up in one click when that is what was sold.
-- ---------------------------------------------------------------------------
drop function if exists admin_upsert_banner_placement(
  uuid, uuid, text, timestamptz, timestamptz, boolean, int, text
);

create function admin_upsert_banner_placement(
  p_id         uuid        default null,
  p_product_id uuid        default null,
  p_headline   text        default null,
  p_starts_at  timestamptz default null,
  p_ends_at    timestamptz default null,
  p_active     boolean     default true,
  p_amount_kes int         default null,
  p_note       text        default null,
  p_sort_order int         default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $fn$
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
      (product_id, headline, starts_at, ends_at, active, amount_kes, note, sort_order)
    values
      (p_product_id, nullif(btrim(coalesce(p_headline, '')), ''),
       coalesce(p_starts_at, now()), p_ends_at, coalesce(p_active, true),
       p_amount_kes, nullif(btrim(coalesce(p_note, '')), ''),
       coalesce(
         p_sort_order,
         (select coalesce(max(sort_order), -1) + 1 from banner_placements)
       ))
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
      sort_order = coalesce(p_sort_order, sort_order),
      updated_at = now()
    where id = p_id
    returning id into new_id;

    if new_id is null then
      raise exception 'no such placement' using errcode = 'P0002';
    end if;
  end if;

  return new_id;
end;
$fn$;

revoke all on function admin_upsert_banner_placement(
  uuid, uuid, text, timestamptz, timestamptz, boolean, int, text, int
) from public, anon;
grant execute on function admin_upsert_banner_placement(
  uuid, uuid, text, timestamptz, timestamptz, boolean, int, text, int
) to authenticated;

-- ---------------------------------------------------------------------------
-- Reorder the whole rotation in one call.
--
-- Takes the full list of ids in the order the owner wants, not a "move this one
-- up" delta. Two reasons: the client already holds the ordered list, so one
-- round trip replaces a pair of row swaps; and a whole-list write cannot leave
-- two placements sharing a position the way two concurrent swaps can.
--
-- Ids the caller did not name keep their relative order and are pushed below
-- the named block -- a placement created in another tab mid-reorder ends up
-- last rather than silently at position zero.
-- ---------------------------------------------------------------------------
create or replace function admin_reorder_banner_placements(p_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  n int;
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  n := coalesce(array_length(p_ids, 1), 0);
  if n = 0 then
    return;
  end if;

  -- Everything not named moves out of the way FIRST, so the named block can
  -- take positions 0..n-1 without colliding with a row that already sits there.
  update banner_placements
     set sort_order = n + sort_order,
         updated_at = now()
   where not (id = any (p_ids));

  update banner_placements bp
     set sort_order = ord.pos - 1,
         updated_at = now()
    from unnest(p_ids) with ordinality as ord(id, pos)
   where bp.id = ord.id;
end;
$fn$;

revoke all on function admin_reorder_banner_placements(uuid[]) from public, anon;
grant execute on function admin_reorder_banner_placements(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed a position for what is already booked.
--
-- Without this every existing placement carries the column default of 0, the
-- order falls back to created_at, and the owner's first drag would look like it
-- reordered rows that were never ordered. Oldest booking leads, which is the
-- one ordering nobody can call arbitrary.
-- ---------------------------------------------------------------------------
with ranked as (
  select id, (row_number() over (order by created_at)) - 1 as pos
    from banner_placements
)
update banner_placements bp
   set sort_order = ranked.pos
  from ranked
 where bp.id = ranked.id;
