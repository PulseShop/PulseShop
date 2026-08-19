-- ---------------------------------------------------------------------------
-- 0051  The control room grows up: subscription billing, platform settings,
--       and the three reads the dashboard was missing.
--
-- WHAT THIS IS FOR. /admindev has been a read-only scoreboard plus two write
-- panels (shop tier, banner ads). The thing it could not do is the thing the
-- platform actually lives on: charge sellers for their tier. 0041 added
-- merchants.plan and revoked the seller's privilege on it, 0045 added
-- plan_upgrade_requests, and both notes said the same sentence -- "billing does
-- not exist yet". This is the ledger half of that: what a shop OWES and what it
-- has PAID, recorded by the owner, because there is still no payment gateway.
--
-- THE SHAPE IS INVOICE + PAYMENTS, NOT A BALANCE COLUMN. A single "paid"
-- boolean cannot express a part payment, and a single amount cannot express two
-- M-Pesa transfers against one month. Payments are rows against an invoice and
-- the balance is derived, so the history survives and the arithmetic cannot
-- drift from it. That is also what makes the Transactions screen possible: it
-- is simply the payments table read in time order.
--
-- WHERE THE BOUNDARY IS. Same as 0047 and 0048, in this file: every admin_*
-- function asserts is_platform_admin() before it touches anything, and the
-- tables themselves grant nothing to anyone. A seller cannot read, write or
-- discover their own invoice yet -- deliberately, because a seller-facing
-- billing screen is a product decision that has not been made. Adding a
-- self-read policy later is one statement.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- subscription_invoices: one row = "this shop owes us for this window".
--
-- The window is a pair of dates rather than a month, because a shop that
-- upgrades mid-month is billed for a part period and "2026-08" cannot say that.
-- amount_kes is stored rather than looked up from the tier table: what a shop
-- was charged in August must not change because the price list changed in
-- September.
-- ---------------------------------------------------------------------------
create table if not exists subscription_invoices (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants(id) on delete cascade,
  -- The tier being billed. Text with a CHECK, matching merchants.plan (0041) --
  -- that column is text with a constraint, not an enum, and the two must agree.
  plan         text not null check (plan in ('explorer', 'boutique', 'influencer')),
  period_start date not null,
  period_end   date not null,
  amount_kes   integer not null check (amount_kes >= 0),
  -- draft  = being prepared, not yet the seller's problem
  -- sent   = the seller has been told
  -- void   = cancelled, kept for the audit trail rather than deleted
  -- Note there is no 'paid': whether it is paid is decided by the payments
  -- below adding up, not by somebody remembering to flip a flag.
  status       text not null default 'draft' check (status in ('draft', 'sent', 'void')),
  issued_at    timestamptz,
  due_on       date,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint subscription_invoices_window_chk check (period_end > period_start),
  -- The same shop billed twice for the same window is a mistake, not a
  -- second invoice.
  constraint subscription_invoices_unique_period unique (merchant_id, period_start, period_end)
);

create index if not exists subscription_invoices_merchant_idx
  on subscription_invoices (merchant_id, period_start desc);

alter table subscription_invoices enable row level security;
revoke all on subscription_invoices from anon, authenticated;

-- ---------------------------------------------------------------------------
-- subscription_payments: money actually received, against an invoice.
--
-- 'waiver' is a method on purpose. Writing off a month for a seller who had a
-- bad experience is a real thing that happens, and recording it as a payment of
-- method 'waiver' keeps the invoice balanced AND leaves a trace, which is what
-- silently voiding the invoice would not.
-- ---------------------------------------------------------------------------
create table if not exists subscription_payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references subscription_invoices(id) on delete cascade,
  amount_kes  integer not null check (amount_kes > 0),
  method      text not null default 'mpesa'
              check (method in ('mpesa', 'bank', 'cash', 'waiver', 'other')),
  reference   text,
  paid_at     timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists subscription_payments_invoice_idx
  on subscription_payments (invoice_id);
create index if not exists subscription_payments_paid_at_idx
  on subscription_payments (paid_at desc);

alter table subscription_payments enable row level security;
revoke all on subscription_payments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- platform_settings: the handful of values the owner edits and the app reads.
--
-- Key/jsonb rather than a column per setting, because the first use is social
-- links -- a list whose length nobody has committed to -- and a table that
-- needs a migration every time a field is added is a table that stops being
-- edited. Public SELECT: these are the links printed in the footer, so they are
-- not secrets. Writes stay owner-only through the function below.
-- ---------------------------------------------------------------------------
create table if not exists platform_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table platform_settings enable row level security;

drop policy if exists "platform settings public read" on platform_settings;
create policy "platform settings public read" on platform_settings for select using (true);

revoke all on platform_settings from anon, authenticated;
grant select on platform_settings to anon, authenticated;

-- Seed the social links with empty strings, so the shape exists before anyone
-- fills it in and the footer has something well-formed to read.
insert into platform_settings (key, value)
values (
  'social_links',
  '{"facebook":"","x":"","tiktok":"","instagram":"","linkedin":"","youtube":""}'::jsonb
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Billing reads and writes.
-- ---------------------------------------------------------------------------

/**
 * Every invoice, with what has been paid against it.
 *
 * paid_kes and balance_kes are derived from subscription_payments rather than
 * stored, so they cannot disagree with the payment history. `state` collapses
 * the stored status and the arithmetic into the one word the owner actually
 * wants: an invoice is overdue when it is unpaid AND its due date has passed,
 * which is not a fact either column knows on its own.
 */
create or replace function admin_list_invoices(
  p_status text default null,   -- null / 'all' | 'draft' | 'sent' | 'void' | 'unpaid' | 'paid' | 'overdue'
  p_search text default '',     -- shop name or handle
  p_limit  int  default 25,
  p_offset int  default 0
)
returns table (
  id            uuid,
  merchant_id   uuid,
  shop_name     text,
  shop_handle   text,
  plan          text,
  period_start  date,
  period_end    date,
  amount_kes    integer,
  paid_kes      bigint,
  balance_kes   bigint,
  status        text,
  state         text,
  issued_at     timestamptz,
  due_on        date,
  note          text,
  created_at    timestamptz,
  total_count   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  lim  int  := least(greatest(coalesce(p_limit, 25), 1), 100);
  off  int  := greatest(coalesce(p_offset, 0), 0);
  term text := nullif(btrim(coalesce(p_search, '')), '');
  want text := nullif(btrim(coalesce(p_status, '')), '');
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  with rolled as (
    select
      inv.*,
      m.name   as m_name,
      m.handle as m_handle,
      coalesce((select sum(p.amount_kes) from subscription_payments p
                 where p.invoice_id = inv.id), 0)::bigint as paid
    from subscription_invoices inv
    join merchants m on m.id = inv.merchant_id
  ),
  labelled as (
    select
      r.*,
      (r.amount_kes - r.paid)::bigint as balance,
      case
        when r.status = 'void'                          then 'void'
        when r.paid >= r.amount_kes                     then 'paid'
        when r.due_on is not null and r.due_on < current_date then 'overdue'
        when r.status = 'draft'                         then 'draft'
        else 'sent'
      end as computed_state
    from rolled r
  ),
  matched as (
    select * from labelled l
    where (term is null or l.m_name ilike '%' || term || '%' or l.m_handle ilike '%' || term || '%')
      and (
        want is null or want = 'all'
        or (want = 'unpaid' and l.computed_state in ('draft', 'sent', 'overdue'))
        or l.computed_state = want
      )
  )
  select
    x.id, x.merchant_id, x.m_name, x.m_handle, x.plan,
    x.period_start, x.period_end, x.amount_kes, x.paid, x.balance,
    x.status, x.computed_state, x.issued_at, x.due_on, x.note, x.created_at,
    (select count(*) from matched)
  from matched x
  order by x.period_start desc, x.created_at desc
  limit lim offset off;
end;
$fn$;

revoke all on function admin_list_invoices(text, text, int, int) from public, anon;
grant execute on function admin_list_invoices(text, text, int, int) to authenticated;

/** Create (null id) or edit an invoice. */
create or replace function admin_upsert_invoice(
  p_id           uuid default null,
  p_merchant_id  uuid default null,
  p_plan         text default null,
  p_period_start date default null,
  p_period_end   date default null,
  p_amount_kes   int  default null,
  p_status       text default 'draft',
  p_due_on       date default null,
  p_note         text default null
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

  if p_merchant_id is null then
    raise exception 'an invoice needs a shop' using errcode = '22023';
  end if;
  if p_period_start is null or p_period_end is null then
    raise exception 'an invoice needs a billing period' using errcode = '22023';
  end if;
  if p_amount_kes is null or p_amount_kes < 0 then
    raise exception 'an invoice needs an amount' using errcode = '22023';
  end if;

  if p_id is null then
    insert into subscription_invoices
      (merchant_id, plan, period_start, period_end, amount_kes, status, due_on, note,
       issued_at)
    values
      (p_merchant_id, coalesce(p_plan, 'explorer'), p_period_start, p_period_end,
       p_amount_kes, coalesce(p_status, 'draft'), p_due_on,
       nullif(btrim(coalesce(p_note, '')), ''),
       -- Stamped when it stops being a draft, which is the moment it becomes
       -- the seller's problem rather than ours.
       case when coalesce(p_status, 'draft') = 'sent' then now() end)
    returning id into new_id;
  else
    update subscription_invoices set
      merchant_id  = p_merchant_id,
      plan         = coalesce(p_plan, plan),
      period_start = p_period_start,
      period_end   = p_period_end,
      amount_kes   = p_amount_kes,
      status       = coalesce(p_status, status),
      due_on       = p_due_on,
      note         = nullif(btrim(coalesce(p_note, '')), ''),
      issued_at    = case
                       when coalesce(p_status, status) = 'sent' and issued_at is null then now()
                       else issued_at
                     end,
      updated_at   = now()
    where id = p_id
    returning id into new_id;

    if new_id is null then
      raise exception 'no such invoice' using errcode = 'P0002';
    end if;
  end if;

  return new_id;
end;
$fn$;

revoke all on function admin_upsert_invoice(uuid, uuid, text, date, date, int, text, date, text)
  from public, anon;
grant execute on function admin_upsert_invoice(uuid, uuid, text, date, date, int, text, date, text)
  to authenticated;

create or replace function admin_delete_invoice(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  delete from subscription_invoices where id = p_id;
end;
$fn$;

revoke all on function admin_delete_invoice(uuid) from public, anon;
grant execute on function admin_delete_invoice(uuid) to authenticated;

/** Record money received against an invoice. */
create or replace function admin_record_payment(
  p_invoice_id uuid        default null,
  p_amount_kes int         default null,
  p_method     text        default 'mpesa',
  p_reference  text        default null,
  p_paid_at    timestamptz default null,
  p_note       text        default null
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

  if p_invoice_id is null then
    raise exception 'a payment needs an invoice' using errcode = '22023';
  end if;
  if not exists (select 1 from subscription_invoices where id = p_invoice_id) then
    raise exception 'no such invoice' using errcode = 'P0002';
  end if;
  if coalesce(p_amount_kes, 0) <= 0 then
    raise exception 'a payment needs an amount' using errcode = '22023';
  end if;

  insert into subscription_payments (invoice_id, amount_kes, method, reference, paid_at, note)
  values (
    p_invoice_id, p_amount_kes, coalesce(p_method, 'mpesa'),
    nullif(btrim(coalesce(p_reference, '')), ''),
    coalesce(p_paid_at, now()),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into new_id;

  return new_id;
end;
$fn$;

revoke all on function admin_record_payment(uuid, int, text, text, timestamptz, text)
  from public, anon;
grant execute on function admin_record_payment(uuid, int, text, text, timestamptz, text)
  to authenticated;

create or replace function admin_delete_payment(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  delete from subscription_payments where id = p_id;
end;
$fn$;

revoke all on function admin_delete_payment(uuid) from public, anon;
grant execute on function admin_delete_payment(uuid) to authenticated;

/** The transactions feed: every payment, newest first, with who it was for. */
create or replace function admin_list_payments(
  p_limit  int default 50,
  p_offset int default 0
)
returns table (
  id           uuid,
  invoice_id   uuid,
  merchant_id  uuid,
  shop_name    text,
  shop_handle  text,
  plan         text,
  amount_kes   integer,
  method       text,
  reference    text,
  paid_at      timestamptz,
  note         text,
  period_start date,
  period_end   date,
  total_count  bigint
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
  off int := greatest(coalesce(p_offset, 0), 0);
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select
    pay.id, pay.invoice_id, m.id, m.name, m.handle, inv.plan,
    pay.amount_kes, pay.method, pay.reference, pay.paid_at, pay.note,
    inv.period_start, inv.period_end,
    (select count(*) from subscription_payments)
  from subscription_payments pay
  join subscription_invoices inv on inv.id = pay.invoice_id
  join merchants m on m.id = inv.merchant_id
  order by pay.paid_at desc
  limit lim offset off;
end;
$fn$;

revoke all on function admin_list_payments(int, int) from public, anon;
grant execute on function admin_list_payments(int, int) to authenticated;

/**
 * The billing headline: what is owed, what came in, and what is late.
 *
 * `mrr_kes` is the sum of the CURRENT tier prices of every shop on a paid plan,
 * not a sum of invoices -- it answers "what should arrive next month" rather
 * than "what did we bill last month", and those diverge the moment somebody
 * upgrades. The prices live in one place here and in tiers.ts on the client;
 * see the note there.
 */
create or replace function admin_billing_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  result jsonb;
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'outstandingKes', coalesce((
      select sum(inv.amount_kes - coalesce(paid.total, 0))
      from subscription_invoices inv
      left join lateral (
        select sum(p.amount_kes) as total
        from subscription_payments p where p.invoice_id = inv.id
      ) paid on true
      where inv.status <> 'void'
        and inv.amount_kes > coalesce(paid.total, 0)
    ), 0),
    'overdueCount', coalesce((
      select count(*)
      from subscription_invoices inv
      left join lateral (
        select sum(p.amount_kes) as total
        from subscription_payments p where p.invoice_id = inv.id
      ) paid on true
      where inv.status <> 'void'
        and inv.due_on is not null and inv.due_on < current_date
        and inv.amount_kes > coalesce(paid.total, 0)
    ), 0),
    'collected30dKes', coalesce((
      select sum(amount_kes) from subscription_payments
      where paid_at >= now() - interval '30 days'
    ), 0),
    'collectedAllKes', coalesce((select sum(amount_kes) from subscription_payments), 0),
    'mrrKes', coalesce((
      select sum(case m.plan when 'boutique' then 1950 when 'influencer' then 6500 else 0 end)
      from merchants m
      where m.shop_status <> 'closed'
    ), 0),
    'invoiceCount', (select count(*) from subscription_invoices),
    'generatedAt', now()
  ) into result;

  return result;
end;
$fn$;

revoke all on function admin_billing_summary() from public, anon;
grant execute on function admin_billing_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard reads.
-- ---------------------------------------------------------------------------

/**
 * Best sellers across the whole platform.
 *
 * Units and revenue come from order_items, which stores product_name and
 * unit_price at the time of sale -- so a product renamed or repriced last week
 * does not rewrite last month's numbers. The join back to products is only for
 * the current image and rating, and is a LEFT join because a deleted product
 * that sold well is still a fact about the month.
 */
create or replace function admin_top_products(p_days int default 30, p_limit int default 8)
returns table (
  product_id   uuid,
  name         text,
  image        text,
  shop_name    text,
  units        bigint,
  revenue_kes  bigint,
  rating       numeric,
  review_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  win int := least(greatest(coalesce(p_days, 30), 1), 365);
  lim int := least(greatest(coalesce(p_limit, 8), 1), 50);
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select
    oi.product_id,
    max(oi.product_name),
    max(oi.image),
    max(m.name),
    sum(oi.qty)::bigint,
    sum(oi.line_total_kes)::bigint,
    max(p.rating),
    max(p.review_count)
  from order_items oi
  join orders o on o.id = oi.order_id
  join merchants m on m.id = o.merchant_id
  left join products p on p.id = oi.product_id
  where o.payment_status <> 'failed'
    and o.placed_at >= now() - make_interval(days => win)
  group by oi.product_id
  order by sum(oi.line_total_kes) desc, sum(oi.qty) desc
  limit lim;
end;
$fn$;

revoke all on function admin_top_products(int, int) from public, anon;
grant execute on function admin_top_products(int, int) to authenticated;

/**
 * Gross order value per day, gap-filled.
 *
 * generate_series so a day with no orders is a zero rather than a missing
 * point -- a line chart that skips empty days draws a quiet week as a straight
 * climb, which is the opposite of what happened.
 */
create or replace function admin_revenue_series(p_days int default 30)
returns table (day date, gross_kes bigint, orders bigint)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  win int := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  with days as (
    select generate_series(
      (current_date - (win - 1))::date, current_date::date, interval '1 day'
    )::date as d
  )
  select
    days.d,
    coalesce(sum(o.total_kes), 0)::bigint,
    count(o.id)::bigint
  from days
  left join orders o
    on o.placed_at::date = days.d
   and o.payment_status <> 'failed'
  group by days.d
  order by days.d;
end;
$fn$;

revoke all on function admin_revenue_series(int) from public, anon;
grant execute on function admin_revenue_series(int) to authenticated;

/**
 * How many buyers came back.
 *
 * Counted on customer_id, so only signed-in buyers are in the denominator --
 * a guest checkout has no identity to match a second order against, and
 * counting phone numbers would make two people sharing a phone into one loyal
 * customer. The returned `tracked` figure says how much of the base this
 * actually measures, because a rate without its denominator is a rumour.
 */
create or replace function admin_repeat_customer_rate(p_days int default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  win      int := least(greatest(coalesce(p_days, 90), 1), 365);
  tracked  int;
  repeats  int;
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  with per_customer as (
    select customer_id, count(*) as n
    from orders
    where customer_id is not null
      and payment_status <> 'failed'
      and placed_at >= now() - make_interval(days => win)
    group by customer_id
  )
  select count(*), count(*) filter (where n > 1)
    into tracked, repeats
  from per_customer;

  return jsonb_build_object(
    'trackedBuyers', coalesce(tracked, 0),
    'repeatBuyers',  coalesce(repeats, 0),
    'ratePct', case when coalesce(tracked, 0) = 0 then 0
                    else round((repeats::numeric / tracked) * 100) end,
    'days', win
  );
end;
$fn$;

revoke all on function admin_repeat_customer_rate(int) from public, anon;
grant execute on function admin_repeat_customer_rate(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Settings.
-- ---------------------------------------------------------------------------

create or replace function admin_set_setting(p_key text, p_value jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  insert into platform_settings (key, value, updated_at)
  values (p_key, coalesce(p_value, '{}'::jsonb), now())
  on conflict (key) do update
    set value = excluded.value, updated_at = now();
end;
$fn$;

revoke all on function admin_set_setting(text, jsonb) from public, anon;
grant execute on function admin_set_setting(text, jsonb) to authenticated;
