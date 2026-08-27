-- 0064_early_access.sql
--
-- Early-access seller registrations for the public form at /earlyaccessform.
--
-- A shop owner claims the founding-cohort offer (top tier free for nine months
-- plus a specialist to switch them over) by leaving their details. This is a
-- lead inbox, read only in the control room (/admindev) under "Early access".
--
-- Security model, same as the rest of the admin surface: the row is WRITE-ONLY
-- to the public. Anyone holding the anon key may INSERT one (the form is public
-- and unauthenticated), but there is no public SELECT/UPDATE/DELETE policy, so a
-- submitter cannot read anyone's registrations back. The only read path is the
-- definer RPC below, which refuses everyone not on platform_admins.

begin;

create table if not exists public.early_access_signups (
  id uuid primary key default gen_random_uuid(),
  -- Length caps are the abuse floor for an unauthenticated insert: a required
  -- field cannot be blank, and none of them can be used to store a novel.
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 200),
  phone text not null check (char_length(phone) between 5 and 40),
  shop_name text not null check (char_length(shop_name) between 1 and 120),
  location text not null check (char_length(location) between 1 and 120),
  -- The optional "where did you hear about us" note. NULL when left blank, so a
  -- real answer and no answer stay distinguishable.
  referral text check (referral is null or char_length(referral) <= 500),
  created_at timestamptz not null default now()
);

-- Newest first is the only order the control room reads them in.
create index if not exists early_access_signups_created_at_idx
  on public.early_access_signups (created_at desc);

alter table public.early_access_signups enable row level security;

-- The public form's write. No USING/SELECT policy accompanies it: submitting is
-- all the public may do, and a submitter reading the table back gets zero rows.
drop policy if exists "early_access public insert" on public.early_access_signups;
create policy "early_access public insert"
  on public.early_access_signups
  for insert
  to anon, authenticated
  with check (true);

-- Admin-only read. security definer so it can see past the write-only RLS, but
-- gated on is_platform_admin() so a non-admin who calls it still gets nothing —
-- the same gate every admin_* function uses. This function, not the /admindev
-- page, is the boundary.
create or replace function public.admin_list_early_access()
returns setof public.early_access_signups
language sql
security definer
set search_path = public
as $$
  select *
  from public.early_access_signups
  where public.is_platform_admin()
  order by created_at desc
$$;

-- A create-or-replace on a fresh function still resets the ACL to execute-to-
-- public, so the revoke/grant is load-bearing, not ceremony.
revoke execute on function public.admin_list_early_access() from anon, authenticated, public;
grant execute on function public.admin_list_early_access() to authenticated;

commit;
