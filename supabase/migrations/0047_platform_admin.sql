-- ---------------------------------------------------------------------------
-- 0047  Owner-only platform statistics, for /admindev.
--
-- WHAT THIS IS. One read-only dashboard for whoever runs PulseShop: how many
-- shops exist, what plans they are on, how many are open, how much stock is
-- listed, and how sellers and buyers are growing. Nothing here writes anything.
--
-- WHERE THE BOUNDARY IS. In this file, not in the page. A React route that
-- checks an email and then renders a dashboard is decoration: the browser holds
-- the anon key, so anyone who reads the bundle can call the same endpoints
-- directly. So the numbers only exist behind functions that refuse to answer
-- anyone who is not an admin, and the admin list is a table the client cannot
-- read or write at all.
--
-- WHY SECURITY DEFINER. These aggregates span auth.users and every shop's
-- orders, which RLS deliberately hides from ordinary callers. The functions
-- therefore run as owner, and each one asserts is_platform_admin() FIRST. They
-- are granted to `authenticated`, so any signed-in user can call them; what
-- stops them is the raise, not the grant. That check is the entire security
-- model here and must never be dropped from a function that reads across
-- tenants.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Who counts as an owner.
--
-- Keyed on email rather than user id on purpose: the owner account may not
-- exist yet, and seeding a uuid that has never been issued is not possible. An
-- address can be authorised in advance and takes effect the moment that account
-- signs up and confirms.
--
-- RLS is enabled with NO policies, and every privilege is revoked. That is not
-- an oversight. Nothing outside the database should be able to read who the
-- admins are, let alone add one; authorising an admin is a deliberate act
-- performed with the service role, never through the API.
-- ---------------------------------------------------------------------------
create table if not exists platform_admins (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;
revoke all on platform_admins from anon, authenticated;

/**
 * Is the caller an owner?
 *
 * Resolves auth.uid(), the signed subject of the JWT and not something a client
 * can forge, to its email and matches that against the table, rather than
 * reading the email claim straight out of the token. Two reasons: a claim can
 * be stale relative to the row, and doing it this way lets the check also
 * require a CONFIRMED email, so an authorised address cannot be claimed by
 * someone who merely began a signup with it.
 */
create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    join platform_admins a on lower(a.email) = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function is_platform_admin() from public, anon;
grant execute on function is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- platform_stats: the whole dashboard in one row.
--
-- Returned as jsonb rather than twenty typed columns because this is a private
-- dashboard that will grow new counters. A jsonb payload means adding one is a
-- change to this function alone, not a DROP/CREATE of its signature plus a
-- matching edit to the client's row type. Nothing joins on it.
-- ---------------------------------------------------------------------------
create or replace function platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'shops', jsonb_build_object(
      'total',        (select count(*) from merchants),
      'open',         (select count(*) from merchants where shop_status = 'open'),
      'closed',       (select count(*) from merchants where shop_status = 'closed'),
      'closing',      (select count(*) from merchants where shop_status = 'closing'),
      -- "Active" here is behaviour, not a status a seller sets: a shop that has
      -- listed something, and a shop someone actually bought from recently. A
      -- shop can be 'open' and completely empty, which is not the same thing.
      'withProducts', (select count(distinct merchant_id) from products),
      'soldLast30d',  (select count(distinct merchant_id) from orders
                        where placed_at >= now() - interval '30 days')
    ),
    'plans', jsonb_build_object(
      'explorer',   (select count(*) from merchants where plan = 'explorer'),
      'boutique',   (select count(*) from merchants where plan = 'boutique'),
      'influencer', (select count(*) from merchants where plan = 'influencer')
    ),
    'products', jsonb_build_object(
      'total',     (select count(*) from products),
      'available', (select count(*) from products where status = 'available'),
      'low',       (select count(*) from products where status = 'low'),
      'out',       (select count(*) from products where status = 'out'),
      'withPhoto', (select count(*) from products
                     where coalesce(array_length(images, 1), 0) > 0)
    ),
    'users', jsonb_build_object(
      'total',      (select count(*) from auth.users),
      'sellers',    (select count(*) from merchants),
      'shoppers',   (select count(*) from auth.users u
                      where not exists (select 1 from merchants m where m.id = u.id)),
      'newLast30d', (select count(*) from auth.users
                      where created_at >= now() - interval '30 days')
    ),
    'orders', jsonb_build_object(
      'total',   (select count(*) from orders),
      'last30d', (select count(*) from orders
                   where placed_at >= now() - interval '30 days'),
      -- Excludes failed orders only, matching product_sold_30d (0044): most
      -- orders here settle off-platform and stay 'idle' forever, so counting
      -- only 'paid' would report near zero for the busiest shops.
      'grossKes', (select coalesce(sum(total_kes), 0) from orders
                    where payment_status <> 'failed')
    ),
    'generatedAt', to_jsonb(now())
  ) into result;

  return result;
end;
$$;

revoke all on function platform_stats() from public, anon;
grant execute on function platform_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- platform_growth: signups per day, split seller vs buyer, with running totals.
--
-- The running totals are what make this a growth curve rather than a noisy bar
-- chart of daily counts, which on a platform this size would read as mostly
-- zeroes with the occasional spike.
-- ---------------------------------------------------------------------------
create or replace function platform_growth(p_days int default 30)
returns table (
  day            date,
  sellers        integer,
  shoppers       integer,
  sellers_total  integer,
  shoppers_total integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  window_days int := greatest(least(coalesce(p_days, 30), 365), 7);
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  with days as (
    select generate_series(
             current_date - (window_days - 1),
             current_date,
             interval '1 day'
           )::date as day
  ),
  signup as (
    select u.created_at::date as day,
           count(*) filter (where m.id is not null) as sellers,
           count(*) filter (where m.id is null)     as shoppers
    from auth.users u
    left join merchants m on m.id = u.id
    group by 1
  )
  select
    d.day,
    coalesce(s.sellers, 0)::integer,
    coalesce(s.shoppers, 0)::integer,
    (select count(*) from auth.users u2
       join merchants m2 on m2.id = u2.id
      where u2.created_at::date <= d.day)::integer,
    (select count(*) from auth.users u2
       left join merchants m2 on m2.id = u2.id
      where m2.id is null and u2.created_at::date <= d.day)::integer
  from days d
  left join signup s on s.day = d.day
  order by d.day;
end;
$$;

revoke all on function platform_growth(int) from public, anon;
grant execute on function platform_growth(int) to authenticated;

-- The owner. Takes effect when this address signs up and confirms its email;
-- until then is_platform_admin() simply answers false for everyone.
insert into platform_admins (email, note)
values ('officialpulseshop@gmail.com', 'Platform owner')
on conflict (email) do nothing;
