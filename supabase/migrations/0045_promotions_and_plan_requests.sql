-- ---------------------------------------------------------------------------
-- 0045  Paid placement, and a way for a seller to ask for the plan that buys it.
--
-- Two tables that only make sense together. `promotions` is the product a shop
-- has paid to put in the marketplace banner; `plan_upgrade_requests` is how a
-- shop asks to be on a plan that lets it create one. The gate between them is
-- deliberate: promoting is the first thing a paid plan actually buys, so the
-- entitlement is enforced in the database rather than only in the UI.
--
-- No new shop identifier is added. merchants.id has been a uuid primary key
-- since 0001, so a promotion just references it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- promotions
--
-- One row = "this shop is paying to surface this product". The window is a pair
-- of timestamps rather than a boolean alone: an ad that has to be switched off
-- by hand is an ad that runs for free the night everyone is asleep. `active` is
-- kept alongside it so a seller can pause without losing the dates.
-- ---------------------------------------------------------------------------
create table if not exists promotions (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  product_id  uuid not null references products(id)  on delete cascade,
  -- Optional banner copy. Null means the banner falls back to the product's own
  -- name, which is the common case; a seller running a seasonal push wants to
  -- say "Back to school" rather than repeat the SKU name.
  headline    text,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),

  -- The same product twice in the banner is a bug, not a bigger buy.
  constraint promotions_unique_product unique (product_id),
  -- An end before a start would silently never run.
  constraint promotions_window_chk check (ends_at is null or ends_at > starts_at)
);

-- The buyer-facing read is always "what is running right now", so the index
-- matches that predicate rather than indexing the columns individually.
create index if not exists promotions_live_idx
  on promotions (starts_at, ends_at) where active;
create index if not exists promotions_merchant_idx on promotions (merchant_id);

alter table promotions enable row level security;

-- Anyone may read a promotion that is actually running. Nothing here is private:
-- it is an advert, and the product it points at is already public.
drop policy if exists "promotions public read" on promotions;
create policy "promotions public read" on promotions for select
  using (
    active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  );

-- A seller reads all of their own, running or not, because the dashboard has to
-- show the paused and expired ones too.
drop policy if exists "promotions owner read" on promotions;
create policy "promotions owner read" on promotions for select
  using (merchant_id = auth.uid());

/**
 * Can this shop promote at all?
 *
 * Explorer cannot. This is the entitlement that a paid plan buys, and it is
 * checked here rather than only in lib/entitlements.ts because the UI gate is a
 * convenience and this is the boundary. SECURITY DEFINER so it can read the plan
 * column while the caller cannot write it (0041).
 */
create or replace function merchant_can_promote(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from merchants m
    where m.id = p_merchant_id and m.plan in ('boutique', 'influencer')
  );
$$;

revoke all on function merchant_can_promote(uuid) from public, anon;
grant execute on function merchant_can_promote(uuid) to authenticated;

-- Insert is the seller's own shop, their own product, and only on a paid plan.
-- The product check is not paranoia: without it a shop could promote a rival's
-- product into a banner that credits itself.
drop policy if exists "promotions owner insert" on promotions;
create policy "promotions owner insert" on promotions for insert
  with check (
    merchant_id = auth.uid()
    and merchant_can_promote(auth.uid())
    and exists (
      select 1 from products p
      where p.id = product_id and p.merchant_id = auth.uid()
    )
  );

drop policy if exists "promotions owner update" on promotions;
create policy "promotions owner update" on promotions for update
  using (merchant_id = auth.uid())
  with check (merchant_id = auth.uid() and merchant_can_promote(auth.uid()));

drop policy if exists "promotions owner delete" on promotions;
create policy "promotions owner delete" on promotions for delete
  using (merchant_id = auth.uid());

revoke all on promotions from anon, authenticated;
grant select on promotions to anon, authenticated;
grant insert, update, delete on promotions to authenticated;

-- ---------------------------------------------------------------------------
-- list_promotions: what the marketplace banner renders.
--
-- Returns the promoted product joined to its shop, newest first, already
-- filtered to the live window by the RLS policy above. Deliberately a function
-- rather than a client-side join: the banner is the first thing on the home
-- page, and three round trips before first paint is the difference between a
-- marketplace and a loading spinner.
-- ---------------------------------------------------------------------------
create or replace function list_promotions(p_limit int default 6)
returns table (
  id           uuid,
  headline     text,
  shop_handle  text,
  shop_name    text,
  product_id   uuid,
  name         text,
  slug         text,
  price_kes    integer,
  discount_pct integer,
  images       text[],
  image_alt    text[],
  status       stock_status,
  rating       numeric,
  review_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    pr.id, pr.headline, m.handle, m.name,
    p.id, p.name, p.slug, p.price_kes, p.discount_pct,
    p.images, coalesce(p.image_alt, '{}'::text[]), p.status,
    p.rating, p.review_count
  from promotions pr
  join products  p on p.id = pr.product_id
  join merchants m on m.id = pr.merchant_id
  -- A paused shop's advert should stop too; the storefront already hides it.
  where m.shop_status <> 'closing'
  order by pr.created_at desc
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
$$;

revoke execute on function list_promotions(int) from public;
grant execute on function list_promotions(int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- plan_upgrade_requests
--
-- 0041 took the plan column away from sellers on purpose: "A seller must not be
-- able to upgrade themselves." That is still true, and billing still does not
-- exist, so this is the honest middle: the seller records that they want a plan,
-- and someone grants it out of band. It also means the demand is queryable
-- instead of living in a WhatsApp thread.
--
-- Note what is NOT here: no way for this table to change merchants.plan. Nothing
-- about it is a privilege escalation path — it is an intent log.
-- ---------------------------------------------------------------------------
create table if not exists plan_upgrade_requests (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    uuid not null references merchants(id) on delete cascade,
  requested_plan text not null check (requested_plan in ('boutique', 'influencer')),
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note           text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

-- One open request per shop. Asking twice is not asking harder, and a queue with
-- duplicates is a queue someone has to de-duplicate by hand.
create unique index if not exists plan_upgrade_requests_one_pending
  on plan_upgrade_requests (merchant_id) where status = 'pending';

alter table plan_upgrade_requests enable row level security;

drop policy if exists "plan requests owner read" on plan_upgrade_requests;
create policy "plan requests owner read" on plan_upgrade_requests for select
  using (merchant_id = auth.uid());

drop policy if exists "plan requests owner insert" on plan_upgrade_requests;
create policy "plan requests owner insert" on plan_upgrade_requests for insert
  with check (merchant_id = auth.uid() and status = 'pending');

-- Cancelling is the only change a seller may make, and only to their own open
-- request. Approving is not theirs to do, so `status` is column-restricted below
-- and the policy keeps them on their own row.
drop policy if exists "plan requests owner cancel" on plan_upgrade_requests;
create policy "plan requests owner cancel" on plan_upgrade_requests for update
  using (merchant_id = auth.uid() and status = 'pending')
  with check (merchant_id = auth.uid() and status in ('pending', 'cancelled'));

revoke all on plan_upgrade_requests from anon, authenticated;
grant select, insert on plan_upgrade_requests to authenticated;
grant update (status) on plan_upgrade_requests to authenticated;
