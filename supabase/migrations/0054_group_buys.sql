-- Bei ya kikundi: a price that unlocks when enough people join.
--
-- The premise: a seller sets a better price on one product, conditional on N
-- buyers committing inside a window. The first buyer gets a join link built
-- for pasting into a WhatsApp group, and the discount is theirs only if they
-- recruit. The buyer becomes the distribution channel.
--
-- This is not Pinduoduo imported wholesale. Roughly a third of Kenyans belong
-- to a chama, and merry-go-rounds are how money already moves between
-- neighbours here; "we buy together and everyone pays less" is a familiar
-- proposition, not a novel mechanic that has to be taught.
--
-- HOW IT SETTLES, and why it is built this way: when the target is reached,
-- the group buy MINTS A DISCOUNT CODE (0035) scoped to that shop and product,
-- capped at the number of members. Members then check out normally.
--
-- That indirection is the whole design. The alternative — a second pricing
-- path through place_order — would mean a second implementation of variant
-- pricing, stacking rules, redemption caps and the one-per-buyer rule, and the
-- two would drift. Instead a group buy is a discount code that has to be
-- earned, and every rule that already governs codes governs it for free.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: reserve stock. Joining is a commitment
-- to buy, not a hold on inventory, and place_order remains the only thing that
-- moves stock. A group that fills against a product that then sells out is a
-- real outcome; pretending otherwise would mean holding stock for people who
-- have paid nothing.

create table group_buys (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  -- The /g/CODE segment. Same alphabet and reasoning as share_links (0052):
  -- this gets pasted into a WhatsApp group and read off phone screens.
  code          text not null unique check (code ~ '^[A-Z2-9]{5,10}$'),
  -- Two is a group. Above about 50 the window stops being credible and the
  -- feature turns into a wholesale order, which is a different product.
  target_count  int not null check (target_count between 2 and 50),
  percent_off   int not null check (percent_off between 1 and 90),
  closes_at     timestamptz not null,
  status        text not null default 'open'
                check (status in ('open', 'filled', 'expired', 'cancelled')),
  -- The code minted when this filled. Null until then, and shown only to
  -- members — see get_group_buy().
  discount_code text,
  filled_at     timestamptz,
  created_at    timestamptz not null default now()
);

create index group_buys_product_idx on group_buys(product_id) where status = 'open';
create index group_buys_merchant_idx on group_buys(merchant_id);

alter table group_buys enable row level security;

-- Sellers manage their own directly. No public-read policy: the buyer side
-- goes through get_group_buy(), which decides what a stranger may see (the
-- progress, yes; the earned discount code, only if they are in the group).
create policy "group_buys owner all" on group_buys for all
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

-- ---------------------------------------------------------------------------
-- group_buy_members: who has committed.
--
-- Keyed on phone rather than on an account, because most people joining one of
-- these arrive from a WhatsApp group and have no PulseShop account. The phone
-- is what the seller would contact them on anyway, and it is what makes the
-- primary key an anti-abuse control: one slot per number, so nobody fills
-- their own group from one handset.
-- ---------------------------------------------------------------------------
create table group_buy_members (
  group_buy_id uuid not null references group_buys(id) on delete cascade,
  buyer_phone  text not null check (char_length(buyer_phone) between 7 and 30),
  buyer_name   text not null check (char_length(buyer_name) between 1 and 80),
  -- Set when the joiner happened to be signed in. Not required, and not the key.
  buyer_id     uuid,
  qty          int not null default 1 check (qty between 1 and 20),
  joined_at    timestamptz not null default now(),
  primary key (group_buy_id, buyer_phone)
);

alter table group_buy_members enable row level security;

-- The seller sees who joined their own group buys. Buyers never select from
-- this table at all: join_group_buy() writes, get_group_buy() reads the count.
-- A public-read policy here would publish a list of phone numbers.
create policy "group_buy_members owner read" on group_buy_members for select
  using (exists (
    select 1 from group_buys gb
    where gb.id = group_buy_id and gb.merchant_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- new_group_code: as new_share_code(), against this table's own codes.
-- ---------------------------------------------------------------------------
create or replace function new_group_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_attempts int := 0;
begin
  loop
    v_code := '';
    for _i in 1..5 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from group_buys gb where gb.code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'could not generate a unique group code';
    end if;
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_group_buy: seller-facing.
--
-- Security definer only because it generates the code (which must be checked
-- against every shop's codes). Ownership of the product is re-derived from
-- auth.uid(), never taken from a parameter.
--
-- ONE OPEN GROUP BUY PER PRODUCT. Two live groups on the same item at
-- different prices is a shop arguing with itself, and it makes "which one does
-- the product page show" unanswerable.
-- ---------------------------------------------------------------------------
create or replace function create_group_buy(
  p_product_id   uuid,
  p_target_count int,
  p_percent_off  int,
  p_hours        int default 48
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_code  text;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  -- 6 hours to 14 days. Under 6 the window closes before a WhatsApp group has
  -- woken up; over 14 nobody remembers they joined.
  if p_hours is null or p_hours < 6 or p_hours > 336 then
    raise exception 'a group buy must run between 6 hours and 14 days';
  end if;

  select p.merchant_id into v_owner from products p where p.id = p_product_id;
  if not found then
    raise exception 'product not found';
  end if;
  if v_owner <> v_uid then
    raise exception 'not your product';
  end if;

  if exists (
    select 1 from group_buys gb
    where gb.product_id = p_product_id and gb.status = 'open' and gb.closes_at > now()
  ) then
    raise exception 'this product already has a group buy running';
  end if;

  v_code := new_group_code();
  insert into group_buys (merchant_id, product_id, code, target_count, percent_off, closes_at)
  values (v_uid, p_product_id, v_code, p_target_count, p_percent_off, now() + make_interval(hours => p_hours));

  return v_code;
end;
$$;

revoke execute on function create_group_buy(uuid, int, int, int) from public, anon;
grant  execute on function create_group_buy(uuid, int, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- group_buy_json: the shared shape both reads return.
--
-- `p_phone` is the caller identifying themselves as a member. It gates exactly
-- one field — the earned discount code — because the code is what the group
-- was FOR, and handing it to anyone who merely opened the link would let a
-- non-member spend a slot the members recruited for.
--
-- Everything else (progress, target, price, deadline) is public on purpose:
-- the link is meant to be forwarded, and a stranger has to be able to see
-- what they would be joining.
-- ---------------------------------------------------------------------------
create or replace function group_buy_json(p_gb group_buys, p_phone text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_product  products%rowtype;
  v_merchant merchants%rowtype;
  v_members  int;
  v_is_member boolean := false;
  v_status   text;
begin
  select * into v_product from products p where p.id = p_gb.product_id;
  select * into v_merchant from merchants m where m.id = p_gb.merchant_id;
  select count(*) into v_members from group_buy_members gbm where gbm.group_buy_id = p_gb.id;

  if p_phone is not null and length(trim(p_phone)) > 0 then
    select true into v_is_member
    from group_buy_members gbm
    where gbm.group_buy_id = p_gb.id and gbm.buyer_phone = trim(p_phone);
    v_is_member := coalesce(v_is_member, false);
  end if;

  -- Expiry is derived on read rather than swept by a job. A row that says
  -- 'open' past its deadline is not a lie anyone acts on: join_group_buy
  -- checks the clock too, so the derived status and the enforced one cannot
  -- disagree.
  v_status := case
    when p_gb.status = 'open' and now() > p_gb.closes_at then 'expired'
    else p_gb.status
  end;

  return jsonb_build_object(
    'code',         p_gb.code,
    'status',       v_status,
    'targetCount',  p_gb.target_count,
    'memberCount',  v_members,
    'percentOff',   p_gb.percent_off,
    'closesAt',     p_gb.closes_at,
    'isMember',     v_is_member,
    -- Only ever to a member of a filled group. See the note above.
    'discountCode', case when v_is_member and p_gb.status = 'filled' then p_gb.discount_code else null end,
    'productId',    v_product.id,
    'productName',  v_product.name,
    'productSlug',  v_product.slug,
    'productImage', coalesce(v_product.images[1], ''),
    'stockQty',     v_product.stock_qty,
    -- The normal price and the group price, both computed here so the two can
    -- never disagree with each other on the way to the screen.
    'priceKes',      effective_price(v_product.price_kes, v_product.discount_pct, 0),
    'groupPriceKes', effective_price(
                       v_product.price_kes,
                       best_discount_pct(v_product.discount_pct, p_gb.percent_off),
                       0
                     ),
    'shopSlug',     v_merchant.handle,
    'shopName',     v_merchant.name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_group_buy: what /g/CODE renders.
-- ---------------------------------------------------------------------------
create or replace function get_group_buy(p_code text, p_phone text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gb group_buys%rowtype;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return null;
  end if;
  select * into v_gb from group_buys gb where upper(gb.code) = upper(trim(p_code));
  if not found then
    return null;
  end if;
  return group_buy_json(v_gb, p_phone);
end;
$$;

revoke execute on function get_group_buy(text, text) from public;
grant  execute on function get_group_buy(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- active_group_buy_for_product: the product page's banner.
-- Null when there is nothing running, which is the common case.
-- ---------------------------------------------------------------------------
create or replace function active_group_buy_for_product(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gb group_buys%rowtype;
begin
  select * into v_gb
  from group_buys gb
  where gb.product_id = p_product_id
    and gb.status = 'open'
    and gb.closes_at > now()
  order by gb.created_at desc
  limit 1;
  if not found then
    return null;
  end if;
  -- No phone: this is the public product page, and the banner never needs to
  -- carry the earned code.
  return group_buy_json(v_gb, null);
end;
$$;

revoke execute on function active_group_buy_for_product(uuid) from public;
grant  execute on function active_group_buy_for_product(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- join_group_buy: the one write a stranger makes.
--
-- Locks the group row FOR UPDATE before counting, so two people racing to be
-- the last member cannot both observe "target not yet reached" and leave the
-- group one short forever.
--
-- Re-joining with the same phone is idempotent, not an error: someone who
-- taps the link twice should see the group they are already in, not a
-- failure. The primary key makes that cheap to detect.
-- ---------------------------------------------------------------------------
create or replace function join_group_buy(
  p_code  text,
  p_name  text,
  p_phone text,
  p_qty   int default 1
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_gb       group_buys%rowtype;
  v_phone    text := trim(coalesce(p_phone, ''));
  v_name     text := trim(coalesce(p_name, ''));
  v_members  int;
  v_dcode    text;
begin
  if length(v_phone) < 7 or length(v_name) = 0 then
    raise exception 'name and phone are required';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 20 then
    raise exception 'invalid quantity';
  end if;

  select * into v_gb from group_buys gb where upper(gb.code) = upper(trim(p_code)) for update;
  if not found then
    raise exception 'this group buy does not exist';
  end if;
  if v_gb.status <> 'open' then
    raise exception 'this group buy has already closed';
  end if;
  if now() > v_gb.closes_at then
    raise exception 'this group buy has already closed';
  end if;

  insert into group_buy_members (group_buy_id, buyer_phone, buyer_name, buyer_id, qty)
  values (v_gb.id, v_phone, v_name, auth.uid(), p_qty)
  on conflict (group_buy_id, buyer_phone)
  do update set buyer_name = excluded.buyer_name, qty = excluded.qty;

  select count(*) into v_members from group_buy_members gbm where gbm.group_buy_id = v_gb.id;

  if v_members >= v_gb.target_count then
    -- Settle: mint the code the group earned.
    --
    -- Prefixed rather than bare so it is obvious in the seller's own code list
    -- where it came from, and so it cannot collide with a code they typed
    -- themselves. max_redemptions is the member count exactly — the group
    -- earned these slots and nobody else gets one.
    v_dcode := 'KIKUNDI-' || v_gb.code;

    insert into discount_codes (
      merchant_id, code, percent_off, starts_at, expires_at, max_redemptions, applies_to, active
    ) values (
      v_gb.merchant_id, v_dcode, v_gb.percent_off, now(),
      -- 48 hours to act. Long enough to reach payday for most people, short
      -- enough that the seller's price is not held open indefinitely.
      now() + interval '48 hours',
      v_members, 'selected', true
    )
    on conflict (merchant_id, upper(code)) do nothing;

    -- Scoped to the one product the group formed around.
    insert into discount_code_products (code_id, product_id)
    select dc.id, v_gb.product_id
    from discount_codes dc
    where dc.merchant_id = v_gb.merchant_id and upper(dc.code) = upper(v_dcode)
    on conflict do nothing;

    update group_buys
       set status = 'filled', filled_at = now(), discount_code = v_dcode
     where id = v_gb.id
    returning * into v_gb;
  end if;

  return group_buy_json(v_gb, v_phone);
end;
$$;

revoke execute on function join_group_buy(text, text, text, int) from public;
grant  execute on function join_group_buy(text, text, text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- merchant_group_buys: the seller's list, with progress.
-- security invoker — group_buys RLS already scopes it to the caller.
-- ---------------------------------------------------------------------------
create or replace function merchant_group_buys()
returns table (
  id            uuid,
  code          text,
  product_id    uuid,
  product_name  text,
  product_image text,
  target_count  int,
  member_count  bigint,
  percent_off   int,
  closes_at     timestamptz,
  status        text,
  discount_code text,
  created_at    timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    gb.id,
    gb.code,
    gb.product_id,
    coalesce(p.name, ''),
    coalesce(p.images[1], ''),
    gb.target_count,
    (select count(*) from group_buy_members m where m.group_buy_id = gb.id),
    gb.percent_off,
    gb.closes_at,
    -- Derived exactly as group_buy_json derives it, so the seller's list and
    -- the buyer's page never disagree about whether something is still open.
    case when gb.status = 'open' and now() > gb.closes_at then 'expired' else gb.status end,
    gb.discount_code,
    gb.created_at
  from group_buys gb
  left join products p on p.id = gb.product_id
  order by gb.created_at desc;
$$;

grant execute on function merchant_group_buys() to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_group_buy: the seller calling it off.
--
-- An UPDATE rather than a DELETE, and only from 'open': a filled group has
-- already minted a code its members are holding, and withdrawing that after
-- they recruited for it is not a thing the product should make easy.
-- ---------------------------------------------------------------------------
create or replace function cancel_group_buy(p_id uuid)
returns void
language sql
volatile
security invoker
set search_path = public
as $$
  update group_buys set status = 'cancelled'
  where id = p_id and status = 'open';
$$;

grant execute on function cancel_group_buy(uuid) to authenticated;
