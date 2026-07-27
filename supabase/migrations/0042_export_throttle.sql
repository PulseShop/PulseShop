-- Per-seller throttle for the emailed catalogue export.
--
-- WHY THIS AND NOT A GENERIC RATE LIMIT. export-products is the most expensive
-- endpoint in the system by a wide margin: it reads up to MAX_EXPORT_PRODUCTS
-- (5000) rows, builds a CSV, base64-encodes it, and hands it to a third-party
-- mail provider that bills per send. Nothing stopped a seller (or a script
-- holding one seller's token) from calling it in a loop, which costs real money
-- and burns the sending domain's reputation long before it costs CPU.
--
-- place_order() deliberately has no equivalent, and does not need one: it is
-- fronted by Turnstile, and proof-of-humanity stops an attacker outright where a
-- rate limit only slows them down. The reverse is true here. The caller is
-- already authenticated and already human; the thing being limited is cost per
-- account, so the key is the user id, not the IP. An IP limit would punish a
-- shared office connection and do nothing about one seller looping from a phone.
--
-- WHY IT IS ONE FUNCTION AND NOT A SELECT-THEN-INSERT. Two concurrent requests
-- would both read "last export was an hour ago" and both proceed. The claim has
-- to be atomic, so the check lives in the WHERE clause of an ON CONFLICT DO
-- UPDATE: exactly one of the two updates matches a row, and the loser gets no
-- RETURNING row and is told to wait.

create table export_requests (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  last_export_at timestamptz not null default now(),
  -- Lifetime count, not a window counter. Cheap to maintain and it is the number
  -- worth having when a bill looks wrong: who is actually generating exports.
  export_count   integer not null default 1 check (export_count >= 0)
);

-- RLS on with no policies at all. Only the edge function touches this table, and
-- it holds the service-role key, which bypasses RLS. Enabling it without
-- policies is therefore the correct posture rather than an oversight: it means
-- the anon and authenticated roles can read and write exactly nothing here, so a
-- seller cannot inspect (or reset) their own throttle through PostgREST.
alter table export_requests enable row level security;

-- ---------------------------------------------------------------------------
-- claim_export_slot — atomically reserve one export for a user.
--
-- Returns 0 when the caller may proceed, otherwise the whole number of seconds
-- they must wait. Returning the wait rather than a bare boolean is what lets the
-- function answer 429 with a Retry-After the dashboard can put in front of the
-- seller, instead of a flat "try again later" they will simply retry at once.
-- ---------------------------------------------------------------------------
create or replace function claim_export_slot(
  p_user_id      uuid,
  p_min_interval interval default '5 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
  v_last    timestamptz;
begin
  insert into export_requests as e (user_id, last_export_at, export_count)
  values (p_user_id, now(), 1)
  on conflict (user_id) do update
     set last_export_at = now(),
         export_count   = e.export_count + 1
   -- The throttle itself. No match means the previous export is too recent, the
   -- UPDATE affects no row, and RETURNING yields nothing.
   where e.last_export_at <= now() - p_min_interval
  returning true into v_claimed;

  if coalesce(v_claimed, false) then
    return 0;
  end if;

  select last_export_at into v_last from export_requests where user_id = p_user_id;

  -- Never report 0 on the denial path: a caller that reads "wait 0 seconds"
  -- retries immediately and spins.
  return greatest(1, ceil(extract(epoch from (v_last + p_min_interval - now()))))::integer;
end;
$$;

-- Same posture as the other definer functions (see 0016). A seller who could
-- call this directly could burn their own quota to nothing, or hold the row lock
-- open; neither is useful to them and both are useful to an attacker.
revoke execute on function claim_export_slot(uuid, interval) from public, anon, authenticated;
grant  execute on function claim_export_slot(uuid, interval) to service_role;
