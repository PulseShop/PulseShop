-- Seller-created discount codes, redeemed at checkout.
--
-- STACKING RULE: a code never stacks with a product's own discount_pct — the
-- BETTER of the two applies, never both (best_discount_pct below). A 10% code
-- on an item already 20% off still sells at 20% off, not 28%.
--
-- SCOPE: a code belongs to exactly one shop (merchant_id), never global — two
-- shops both wanting "SALE10" is the normal case, not a collision.
--
-- ABUSE CONTROLS: an optional total redemption cap (max_redemptions), plus a
-- hard one-redemption-per-buyer rule enforced by two partial unique indexes
-- below — one keyed on the signed-in buyer's id (strong: can't be typo'd
-- around), one on the phone number every checkout collects regardless of
-- auth state (weaker, but it's the only signal a guest has, and it's what the
-- seller contacts anyway).
--
-- place_order is the ONLY place a code is actually applied and redeemed.
-- preview_discount_code exists purely so the buyer sees the effect before
-- submitting — it is advisory, never authoritative.

create table discount_codes (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references merchants(id) on delete cascade,
  code             text not null check (char_length(code) between 4 and 24),
  percent_off      int  not null check (percent_off between 1 and 90),
  starts_at        timestamptz not null default now(),
  expires_at       timestamptz not null,
  -- null = uncapped. Still bounded by the one-per-buyer rule, but an
  -- uncapped code shared publicly is a seller choice, not a footgun we hide.
  max_redemptions  int check (max_redemptions is null or max_redemptions > 0),
  redemption_count int not null default 0 check (redemption_count >= 0),
  applies_to       text not null default 'all' check (applies_to in ('all', 'selected')),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  check (expires_at > starts_at)
);

-- Case-insensitive uniqueness PER SHOP, not global.
create unique index discount_codes_shop_code_idx on discount_codes (merchant_id, upper(code));
create index discount_codes_merchant_idx on discount_codes(merchant_id);

alter table discount_codes enable row level security;

-- Sellers manage their own codes directly through the client — no CRUD RPC
-- needed for this. Deliberately no public-read policy: a code is redeemed
-- through preview_discount_code/place_order (both security definer, both
-- returning pass/fail rather than any row), never fetched as a row by a
-- buyer. A public-read policy here would let anyone enumerate every code for
-- every shop.
create policy "discount_codes owner all" on discount_codes for all
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

-- ---------------------------------------------------------------------------
-- discount_code_products: which products a 'selected' code applies to.
-- Irrelevant (and ignored) when applies_to = 'all'.
-- ---------------------------------------------------------------------------
create table discount_code_products (
  code_id    uuid not null references discount_codes(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (code_id, product_id)
);

alter table discount_code_products enable row level security;

create policy "discount_code_products owner all" on discount_code_products for all
  using (exists (
    select 1 from discount_codes dc
    where dc.id = code_id and dc.merchant_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from discount_codes dc
    where dc.id = code_id and dc.merchant_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- discount_redemptions: one row per order a code was used on. This is what
-- the two abuse controls (cap + one-per-buyer) are actually enforced against.
-- ---------------------------------------------------------------------------
create table discount_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code_id     uuid not null references discount_codes(id) on delete cascade,
  order_id    uuid not null unique references orders(id) on delete cascade,
  -- Null for a guest checkout — buyer_phone is the fallback signal for them.
  buyer_id    uuid,
  buyer_phone text not null,
  amount_kes  int not null check (amount_kes >= 0),
  created_at  timestamptz not null default now()
);

create index discount_redemptions_code_idx on discount_redemptions(code_id);

-- The actual one-per-buyer enforcement. Two indexes because neither signal
-- alone covers both buyer types: a partial index on buyer_id (skipped for
-- guests, where it's always null) plus an unconditional one on phone (every
-- checkout collects it, signed in or not).
create unique index discount_redemptions_code_buyer_idx
  on discount_redemptions (code_id, buyer_id) where buyer_id is not null;
create unique index discount_redemptions_code_phone_idx
  on discount_redemptions (code_id, buyer_phone);

alter table discount_redemptions enable row level security;

-- Read-only from the client (the seller's "12 / 50 used" display). Only
-- place_order writes here, as the table owner — RLS doesn't apply to it.
create policy "discount_redemptions owner read" on discount_redemptions for select
  using (exists (
    select 1 from discount_codes dc
    where dc.id = code_id and dc.merchant_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- What a buyer actually pays, for tracking after the fact.
-- discount_kes = subtotal_kes - total_kes, stored rather than computed on
-- every read since both the merchant Orders page and buyer order lookup
-- already project these columns straight off the row (to_jsonb in
-- get_order_by_token, select "*" in listOrders/listMyOrders).
-- ---------------------------------------------------------------------------
alter table orders
  add column if not exists discount_code text,
  add column if not exists discount_kes integer not null default 0 check (discount_kes >= 0);

-- ---------------------------------------------------------------------------
-- best_discount_pct: the rule that makes stacking impossible by construction.
-- Kept separate from effective_price() (0027) rather than folded into it —
-- effective_price is used everywhere prices are computed, including places
-- that have never heard of a discount code (search, the product grid); this
-- is the one extra step callers who DO know about a code take on top of it.
-- ---------------------------------------------------------------------------
create or replace function best_discount_pct(p_product_discount int, p_code_discount int)
returns int
language sql
immutable
set search_path = public
as $$
  select greatest(coalesce(p_product_discount, 0), coalesce(p_code_discount, 0));
$$;

grant execute on function best_discount_pct(int, int) to public;

-- ---------------------------------------------------------------------------
-- place_order: adds p_discount_code. Everything else is byte-for-byte 0032's
-- version.
--
-- The code is resolved and validated exactly once, at the same point the
-- shop itself is first identified (a code is scoped to a shop, and which shop
-- this order is for isn't known until the first item is looked up — there is
-- no separate "shop" parameter). Locked FOR UPDATE there too, so two
-- concurrent redemptions racing for the last slot under max_redemptions can't
-- both win: the second to acquire the lock re-checks the cap and the
-- per-buyer rule against what the first one just committed.
--
-- Every failure path — code doesn't exist, wrong shop, inactive, outside its
-- date window, cap reached, already used by this buyer, or matches no line in
-- the cart — raises the SAME message. Distinguishing them would let someone
-- probing codes tell "wrong" from "real but expired" apart, which confirms a
-- guessed code exists.
--
-- Signature changes (new trailing param) ⇒ DROP first. Postgres treats a
-- different parameter list as a different function; CREATE OR REPLACE would
-- silently leave the OLD 8-arg place_order (and its service_role grant)
-- alongside this one rather than replacing it. This migration and the
-- updated place-order Edge Function (which must pass the new argument) have
-- to ship together — the Edge Function calls this exact signature by name.
-- ---------------------------------------------------------------------------
drop function if exists place_order(text, text, text, order_channel, payment_method, jsonb, uuid, uuid);

create or replace function place_order(
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_notes   text,
  p_channel          order_channel,
  p_payment_method   payment_method,
  p_items            jsonb,
  p_idempotency_key  uuid default null,
  p_customer_id      uuid default null,
  p_discount_code    text default null
)
returns table(order_id uuid, reference text, access_token text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order_id       uuid := gen_random_uuid();
  v_reference      text;
  v_token          text := new_order_token();
  v_merchant_id    uuid;
  v_subtotal       integer := 0;  -- pre-code (but post product-discount) total
  v_total          integer := 0;  -- what the buyer actually pays
  v_lines          order_line[] := '{}';
  v_line_json      jsonb;
  v_product        products%rowtype;
  v_unit           integer;
  v_unit_no_code   integer;
  v_qty            integer;
  v_size           text;
  v_color          text;
  v_attempts       integer := 0;
  v_existing       orders%rowtype;
  v_code           discount_codes%rowtype;
  v_code_found     boolean := false;
  v_code_eligible  boolean;
  v_any_eligible   boolean := false;
  v_pct            integer;
begin
  if p_idempotency_key is not null then
    select * into v_existing from orders o where o.idempotency_key = p_idempotency_key;
    if found then
      return query select v_existing.id, v_existing.reference, v_existing.access_token;
      return;
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'order must have at least one item';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many items in one order';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) = 0
     or length(trim(coalesce(p_customer_phone, ''))) = 0 then
    raise exception 'customer name and phone are required';
  end if;

  for v_line_json in select * from jsonb_array_elements(p_items) loop
    v_qty   := (v_line_json->>'qty')::integer;
    v_size  := nullif(v_line_json->>'size', '');
    v_color := nullif(v_line_json->>'color', '');

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid quantity';
    end if;
    if v_qty > 100 then
      raise exception 'quantity too large';
    end if;

    select * into v_product from products
      where id = (v_line_json->>'product_id')::uuid
      for update;
    if not found then
      raise exception 'product not found: %', v_line_json->>'product_id';
    end if;

    if v_merchant_id is null then
      v_merchant_id := v_product.merchant_id;

      if exists (
        select 1 from merchants mm
        where mm.id = v_merchant_id and mm.shop_status <> 'open'
      ) then
        raise exception 'this shop is not accepting orders right now';
      end if;

      if p_discount_code is not null and length(trim(p_discount_code)) > 0 then
        select * into v_code
        from discount_codes dc
        where dc.merchant_id = v_merchant_id
          and upper(dc.code) = upper(trim(p_discount_code))
        for update;

        if not found
           or not v_code.active
           or now() < v_code.starts_at
           or now() > v_code.expires_at
           or (v_code.max_redemptions is not null and v_code.redemption_count >= v_code.max_redemptions)
           or exists (
             select 1 from discount_redemptions dr
             where dr.code_id = v_code.id
               and (dr.buyer_id = p_customer_id or dr.buyer_phone = trim(p_customer_phone))
           )
        then
          raise exception 'discount code is no longer valid for this order';
        end if;

        v_code_found := true;
      end if;
    elsif v_product.merchant_id <> v_merchant_id then
      raise exception 'all items in an order must belong to the same shop';
    end if;

    if v_product.stock_qty < v_qty then
      raise exception 'insufficient stock for %', v_product.name;
    end if;

    if coalesce(array_length(v_product.sizes, 1), 0) > 0
       and v_size is not null
       and not (v_size = any(v_product.sizes)) then
      raise exception 'size % is not available for %', v_size, v_product.name;
    end if;
    if coalesce(array_length(v_product.colors, 1), 0) > 0
       and v_color is not null
       and not (v_color = any(v_product.colors)) then
      raise exception 'color % is not available for %', v_color, v_product.name;
    end if;

    v_code_eligible := v_code_found and (
      v_code.applies_to = 'all'
      or exists (
        select 1 from discount_code_products dcp
        where dcp.code_id = v_code.id and dcp.product_id = v_product.id
      )
    );
    v_any_eligible := v_any_eligible or v_code_eligible;

    v_pct := case when v_code_eligible
                  then best_discount_pct(v_product.discount_pct, v_code.percent_off)
                  else coalesce(v_product.discount_pct, 0)
             end;

    v_unit_no_code := effective_price(
      v_product.price_kes, v_product.discount_pct,
      variant_adj(v_product.size_price_adj,  v_size)
    + variant_adj(v_product.color_price_adj, v_color)
    );
    v_unit := effective_price(
      v_product.price_kes, v_pct,
      variant_adj(v_product.size_price_adj,  v_size)
    + variant_adj(v_product.color_price_adj, v_color)
    );

    v_subtotal := v_subtotal + v_unit_no_code * v_qty;
    v_total    := v_total    + v_unit         * v_qty;

    update products set stock_qty = stock_qty - v_qty where id = v_product.id;

    v_lines := v_lines || row(
      v_product.id, v_product.name, coalesce(v_product.images[1], ''),
      v_size, v_qty, v_unit, v_color
    )::order_line;
  end loop;

  -- A code that matched no line in the cart (every 'selected' code has to
  -- match at least one, 'all' codes always do) is treated the same as any
  -- other invalid code — same message, checked once the whole cart is known.
  if v_code_found and not v_any_eligible then
    raise exception 'discount code is no longer valid for this order';
  end if;

  loop
    v_reference := 'PS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
    exit when not exists (select 1 from orders where orders.reference = v_reference);
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then
      raise exception 'could not generate a unique order reference';
    end if;
  end loop;

  insert into orders (
    id, reference, access_token, merchant_id, customer_id, idempotency_key,
    customer_name, customer_phone, customer_notes,
    channel, payment_method, payment_status, subtotal_kes, total_kes,
    discount_code, discount_kes
  ) values (
    v_order_id, v_reference, v_token, v_merchant_id, p_customer_id, p_idempotency_key,
    trim(p_customer_name), trim(p_customer_phone), coalesce(p_customer_notes, ''),
    p_channel, p_payment_method, 'pending', v_subtotal, v_total,
    case when v_code_found then v_code.code else null end,
    v_subtotal - v_total
  );

  insert into order_items (order_id, product_id, product_name, image, size, color, qty, unit_price_kes)
  select v_order_id, l.product_id, l.product_name, l.image, l.size, l.color, l.qty, l.unit_price_kes
  from unnest(v_lines) as l;

  if v_code_found then
    insert into discount_redemptions (code_id, order_id, buyer_id, buyer_phone, amount_kes)
    values (v_code.id, v_order_id, p_customer_id, trim(p_customer_phone), v_subtotal - v_total);

    update discount_codes set redemption_count = redemption_count + 1 where id = v_code.id;
  end if;

  return query select v_order_id, v_reference, v_token;

exception
  when unique_violation then
    select * into v_existing from orders o where o.idempotency_key = p_idempotency_key;
    if found then
      return query select v_existing.id, v_existing.reference, v_existing.access_token;
      return;
    end if;
    raise;
end;
$function$;

revoke execute on function place_order(text, text, text, order_channel, payment_method, jsonb, uuid, uuid, text) from public, anon, authenticated;
grant  execute on function place_order(text, text, text, order_channel, payment_method, jsonb, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- preview_discount_code: advisory only. Tells the buyer what a code is worth
-- BEFORE they submit, using the same best-of-two rule place_order enforces —
-- but it is not the authority place_order is; a code that stops qualifying in
-- the seconds between preview and submit is caught there, not here.
--
-- Ignores variant price adjustments (unlike place_order) — an estimate here
-- being off by whatever a size/colour upcharge is has no consequence, since
-- nothing is charged from this function's output. Keeping it to base price
-- avoids duplicating that machinery in a second place.
--
-- anon-callable: a guest has to be able to check a code before creating any
-- account. The single generic `reason` on every failure path is deliberate —
-- see the note on place_order above.
-- ---------------------------------------------------------------------------
create or replace function preview_discount_code(
  p_merchant_id    uuid,
  p_code           text,
  p_items          jsonb,  -- [{ "product_id": uuid, "qty": int }, ...]
  p_customer_phone text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_code            discount_codes%rowtype;
  v_reason constant text := 'This code isn''t valid for this order.';
  v_item            jsonb;
  v_product         products%rowtype;
  v_qty             int;
  v_eligible        boolean;
  v_pct             int;
  v_no_code_total   int := 0;
  v_with_code_total int := 0;
  v_any_eligible    boolean := false;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return jsonb_build_object('valid', false, 'reason', v_reason, 'discountKes', 0);
  end if;

  select * into v_code
  from discount_codes dc
  where dc.merchant_id = p_merchant_id
    and upper(dc.code) = upper(trim(p_code));

  if not found
     or not v_code.active
     or now() < v_code.starts_at
     or now() > v_code.expires_at
     or (v_code.max_redemptions is not null and v_code.redemption_count >= v_code.max_redemptions)
  then
    return jsonb_build_object('valid', false, 'reason', v_reason, 'discountKes', 0);
  end if;

  if p_customer_phone is not null and length(trim(p_customer_phone)) > 0
     and exists (
       select 1 from discount_redemptions dr
       where dr.code_id = v_code.id and dr.buyer_phone = trim(p_customer_phone)
     )
  then
    return jsonb_build_object('valid', false, 'reason', v_reason, 'discountKes', 0);
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_qty := greatest(coalesce((v_item->>'qty')::int, 0), 0);
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    if not found or v_qty = 0 then
      continue;
    end if;

    v_eligible := v_code.applies_to = 'all' or exists (
      select 1 from discount_code_products dcp
      where dcp.code_id = v_code.id and dcp.product_id = v_product.id
    );

    v_pct := case when v_eligible
                  then best_discount_pct(v_product.discount_pct, v_code.percent_off)
                  else coalesce(v_product.discount_pct, 0)
             end;

    v_no_code_total   := v_no_code_total   + effective_price(v_product.price_kes, v_product.discount_pct, 0) * v_qty;
    v_with_code_total := v_with_code_total + effective_price(v_product.price_kes, v_pct, 0) * v_qty;
    v_any_eligible    := v_any_eligible or v_eligible;
  end loop;

  if not v_any_eligible then
    return jsonb_build_object('valid', false, 'reason', v_reason, 'discountKes', 0);
  end if;

  return jsonb_build_object(
    'valid', true,
    'reason', null,
    'percentOff', v_code.percent_off,
    'discountKes', v_no_code_total - v_with_code_total,
    'newTotal', v_with_code_total
  );
end;
$function$;

revoke execute on function preview_discount_code(uuid, text, jsonb, text) from public;
grant  execute on function preview_discount_code(uuid, text, jsonb, text) to anon, authenticated;
