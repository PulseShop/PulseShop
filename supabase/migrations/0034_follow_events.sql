-- Follower growth history, for the dashboard's followers chart.
--
-- `follows` (0004) only has a row while someone is currently following a
-- shop — an unfollow DELETEs it. That makes "followers over time" impossible
-- to answer honestly from `follows` alone: every unfollow would silently
-- rewrite the past, so the chart could only ever slope up and would hide
-- churn a seller actually needs to see.
--
-- follow_events is an append-only log of both directions, written by a
-- trigger so no application code has to remember to keep it in sync.
create table follow_events (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  -- No FK to auth.users. A deleted account must not retroactively erase or
  -- rewrite a merchant's OWN follower history — that history belongs to the
  -- merchant being followed, not the follower.
  follower_id uuid not null,
  action      text not null check (action in ('follow', 'unfollow')),
  created_at  timestamptz not null default now()
);

create index follow_events_merchant_day_idx on follow_events(merchant_id, created_at);

alter table follow_events enable row level security;

-- Read-only from the client, and only your own shop's log. There is
-- deliberately no insert/update/delete policy for anon/authenticated — the
-- trigger below is the only writer, and it runs as the table owner (security
-- definer), which RLS does not apply to.
create policy "follow_events owner read" on follow_events for select
  using ((select auth.uid()) = merchant_id);

-- One synthetic 'follow' event per follow that already exists, backdated to
-- when it happened. Unfollows that happened before this migration are gone
-- and cannot be reconstructed — the chart is accurate from here forward, and
-- the dashboard says as much for a new shop's first month.
insert into follow_events (merchant_id, follower_id, action, created_at)
select merchant_id, follower_id, 'follow', created_at
from follows;

create or replace function log_follow_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into follow_events (merchant_id, follower_id, action)
    values (new.merchant_id, new.follower_id, 'follow');
    return new;
  else
    insert into follow_events (merchant_id, follower_id, action)
    values (old.merchant_id, old.follower_id, 'unfollow');
    return old;
  end if;
end;
$$;

create trigger follows_log_event
  after insert or delete on follows
  for each row execute function log_follow_event();

-- ---------------------------------------------------------------------------
-- merchant_follower_series: a true running total per day, not a point-in-time
-- snapshot — `followers` on day N is the baseline plus every gain/loss up to
-- and including day N, so an unfollow shows as a dip instead of vanishing.
--
-- security invoker: `follow_events owner read` above already scopes every row
-- to the calling merchant, so invoker cannot see past that boundary either.
--
-- Same p_days/p_tz clamp-and-validate convention as merchant_analytics (0020):
-- bucket by the merchant's OWN calendar day, and an unrecognised zone falls
-- back to UTC rather than erroring the whole chart.
-- ---------------------------------------------------------------------------
create or replace function merchant_follower_series(p_days int default 30, p_tz text default 'UTC')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with args as (
    select least(greatest(coalesce(p_days, 30), 1), 90) as days,
           case when exists (select 1 from pg_timezone_names z where z.name = p_tz)
                then p_tz else 'UTC' end as tz
  ),
  uid as (select auth.uid() as id),
  mine as (
    select fe.action, (timezone((select tz from args), fe.created_at))::date as local_day
    from follow_events fe
    where fe.merchant_id = (select id from uid)
  ),
  day_series as (
    select d::date as day
    from args,
         generate_series(
           (timezone(args.tz, now()))::date - (args.days - 1),
           (timezone(args.tz, now()))::date,
           interval '1 day'
         ) d
  ),
  -- Net followers as of just before the window opens, so the first day's
  -- running total isn't "growth since the dawn of the shop".
  baseline as (
    select
      coalesce(count(*) filter (where action = 'follow'), 0)
      - coalesce(count(*) filter (where action = 'unfollow'), 0) as net
    from mine
    where local_day < (select min(day) from day_series)
  ),
  daily as (
    select
      ds.day,
      coalesce(count(*) filter (where m.action = 'follow'), 0)::int   as gained,
      coalesce(count(*) filter (where m.action = 'unfollow'), 0)::int as lost
    from day_series ds
    left join mine m on m.local_day = ds.day
    group by ds.day
  ),
  -- The window function has to be materialised in its own (non-aggregate)
  -- CTE first — Postgres rejects a window function nested inside jsonb_agg's
  -- argument in the same query level.
  running as (
    select
      day, gained, lost,
      (select net from baseline) + sum(gained - lost) over (order by day) as followers
    from daily
  )
  select jsonb_build_object(
    'baseline', (select net from baseline),
    'days', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', to_char(day, 'YYYY-MM-DD'),
          'followers', followers,
          'gained', gained,
          'lost', lost
        ) order by day
      )
      from running
    ), '[]'::jsonb)
  );
$$;

revoke execute on function merchant_follower_series(int, text) from public, anon;
grant  execute on function merchant_follower_series(int, text) to authenticated;
