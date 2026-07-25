-- The seller's subscription plan, as a real column instead of marketing copy.
--
-- routes/marketing/tiers.ts has described Explorer / Boutique / Influencer since
-- pricing went up, but nothing anywhere read it: every feature was open to every
-- shop because there was no plan to check against. This is the smallest thing
-- that makes an entitlement checkable — one column, three values, defaulting to
-- the free tier.
--
-- Billing still does not exist. Until it does the column is set by hand (support
-- flipping a shop to 'influencer'), which is exactly what a plan column is for
-- in the gap before a payment provider is wired up: the gate lives in one place
-- from the start, so turning billing on later means writing to this column
-- rather than retro-fitting entitlement checks across the app.
--
-- Public on purpose — it rides along on `merchants public read`, same as
-- shop_status and fulfillment. A buyer can already infer a shop's plan from
-- which features its storefront has; hiding the column would only cost the
-- storefront an extra round trip to discover the same thing.

alter table merchants
  add column if not exists plan text not null default 'explorer';

alter table merchants drop constraint if exists merchants_plan_chk;
alter table merchants add constraint merchants_plan_chk
  check (plan in ('explorer', 'boutique', 'influencer'));

-- ---------------------------------------------------------------------------
-- A seller must not be able to upgrade themselves.
--
-- `merchants owner update` (0001) is a row-level policy, and RLS has no concept
-- of columns — it lets the owner write every column on their own row, which
-- would make this gate a single PATCH away from meaningless. Column-level
-- privileges are the mechanism that does understand columns, so the UPDATE
-- grant is narrowed to everything EXCEPT plan.
--
-- Postgres has no "revoke update on one column" for a role that holds table-wide
-- UPDATE: the table-wide grant has to go first, then be re-issued per column.
-- Listing them explicitly means a future column is NOT writable by sellers until
-- someone adds it here — which is the safer direction to fail.
-- ---------------------------------------------------------------------------
revoke update on merchants from authenticated;
grant update (
  name, handle, bio, location, avatar_url, banner_url,
  whatsapp, instagram, facebook,
  shop_status, fulfillment, tagline, meta_description
) on merchants to authenticated;

-- anon never legitimately updates a merchant. `merchants owner update` already
-- makes it impossible (auth.uid() is null for anon, so no row matches), but the
-- table-wide grant Supabase ships with means the privilege is sitting there
-- doing nothing except widening the blast radius of a future policy mistake.
revoke update on merchants from anon;

-- Deliberately no seed. Shops that should be on a paid plan get set by hand
-- until billing exists; a blanket UPDATE here would hand every existing shop a
-- tier nobody paid for, and taking it back later reads as a downgrade.
