-- ---------------------------------------------------------------------------
-- 0062  One cart across many shops, collected from a pickup station.
--
-- This is the re-platform from "social commerce, seller fulfils" to a
-- marketplace: a buyer fills one cart from several shops, pays once, and
-- collects everything from a pickup station. Goods flow seller -> warehouse ->
-- station -> buyer.
--
-- WHY A PARENT GROUP AND NOT ONE FLAT ORDER. `orders` carries a single
-- merchant_id and every seller-facing query in the app is built on it: the
-- orders dashboard, revenue, analytics, the per-shop order list. Moving
-- merchant onto order_items would make a mixed cart representable and would
-- also mean rewriting all of that, and would leave a seller reading rows that
-- contain other shops' lines. So the sub-order stays EXACTLY the shape it is
-- today, one per seller, and a new parent row is what the buyer holds. Sellers
-- notice nothing; buyers get one reference, one payment, one collection.
--
-- The buyer-facing identifier is the GROUP's reference. Sub-orders keep their
-- own unique references (`PS-XXXXXXXXXX-1`, `-2`) because orders.reference is
-- unique and not null and the seller quotes it to the warehouse, but nobody
-- asks a shopper for one.
--
-- IDEMPOTENCY MOVES TO THE GROUP. orders.idempotency_key is unique, so N
-- sub-orders written under one key would collide on the second insert. The
-- group holds the key and the sub-orders leave the column null (Postgres
-- allows many nulls in a unique index). A retry after a dropped response
-- therefore replays the whole group, not part of it.
--
-- WHY NOT A `warehouses` TABLE YET. There is one hub and no UI reads its
-- address, so a table with a single row nothing queries would be speculative
-- schema. Stations are what the buyer chooses and what the checkout has to
-- list, so stations are what gets modelled. A warehouses table earns its place
-- the day there is a second hub or the seller UI has to print a dispatch label.
--
-- place_order() (0053) IS LEFT ALONE. It still serves the single-shop path and
-- any client that has not been updated. This adds a function beside it rather
-- than widening it, because the two differ in their most basic invariant: one
-- REQUIRES a single merchant and the other requires several to be possible.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- pickup_stations
-- ---------------------------------------------------------------------------
create table if not exists pickup_stations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  town          text not null,
  address       text not null,
  opening_hours text not null default '',
  -- Deactivating beats deleting: a station that closes is still referenced by
  -- every order ever collected there, and the FK below is deliberately not
  -- ON DELETE CASCADE for that reason.
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint pickup_stations_name_len check (length(name) between 1 and 80),
  constraint pickup_stations_town_len check (length(town) between 1 and 60),
  constraint pickup_stations_addr_len check (length(address) between 1 and 200)
);

create index if not exists pickup_stations_active_idx
  on pickup_stations (sort_order, name) where active;

alter table pickup_stations enable row level security;

-- Readable by anyone (the checkout has to list them before a buyer signs in);
-- writable by nobody through the API. Stations are operations data, changed by
-- the operator through the dashboard or SQL, so there is deliberately no
-- insert/update/delete policy here at all.
drop policy if exists "pickup stations are public" on pickup_stations;
create policy "pickup stations are public"
  on pickup_stations for select
  using (active);

-- ---------------------------------------------------------------------------
-- order_groups: the thing the buyer actually placed.
-- ---------------------------------------------------------------------------
create table if not exists order_groups (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  access_token      text not null,
  customer_id       uuid references auth.users(id) on delete set null,
  customer_name     text not null,
  customer_phone    text not null,
  customer_notes    text not null default '',
  -- restrict, not cascade: deleting a station must never delete orders.
  pickup_station_id uuid not null references pickup_stations(id) on delete restrict,
  payment_method    payment_method,
  payment_status    payment_status not null default 'pending',
  subtotal_kes      integer not null default 0 check (subtotal_kes >= 0),
  total_kes         integer not null default 0 check (total_kes >= 0),
  idempotency_key   uuid unique,
  placed_at         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists order_groups_customer_idx on order_groups (customer_id);
create index if not exists order_groups_station_idx  on order_groups (pickup_station_id);

alter table order_groups enable row level security;

-- Signed-in buyers read their own groups. Guests never match this and go
-- through get_order_group_by_token() instead, exactly as guests already do for
-- single orders (0018).
drop policy if exists "buyers read their own order groups" on order_groups;
create policy "buyers read their own order groups"
  on order_groups for select
  using (customer_id is not null and customer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- orders gains its parent link. Nullable on purpose: every order placed before
-- today has no group and must keep working.
-- ---------------------------------------------------------------------------
alter table orders
  add column if not exists group_id uuid references order_groups(id) on delete cascade;

create index if not exists orders_group_idx on orders (group_id);

comment on column orders.group_id is
  'Parent order_groups row when this order came from a multi-shop cart. Null for single-shop orders placed through place_order(). See migration 0062.';

-- ---------------------------------------------------------------------------
-- A cart line, carrying the merchant so the fan-out below can group on it.
-- order_line (0001) cannot: it has no merchant, because until now every line in
-- an order belonged to the same one by definition.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'cart_line') then
    create type cart_line as (
      merchant_id            uuid,
      product_id             uuid,
      product_name           text,
      image                  text,
      size                   text,
      color                  text,
      qty                    integer,
      unit_price_kes         integer,
      unit_price_no_code_kes integer
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- place_cart_order: one payment, one collection, N seller orders.
--
-- Mirrors place_order()'s guards line for line — the same stock locks, the same
-- variant checks, the same error strings, so the Edge Function's safe-error
-- allowlist keeps working unchanged. What differs is that the merchant is
-- resolved PER LINE instead of being pinned by the first one, and that the
-- inserts happen once per distinct merchant at the end.
--
-- DISCOUNT CODES STAY PER-SELLER, because that is what they are: a code belongs
-- to one shop and is funded by it. In a mixed cart it is resolved against the
-- shops present and applied to that seller's sub-order only. A code that
-- matches no shop in the cart is rejected with the same message as any other
-- invalid code rather than being silently ignored, so the buyer is never shown
-- a discount that did not happen.
-- ---------------------------------------------------------------------------
create or replace function place_cart_order(
  p_customer_name     text,
  p_customer_phone    text,
  p_customer_notes    text,
  p_pickup_station_id uuid,
  p_payment_method    payment_method,
  p_items             jsonb,
  p_idempotency_key   uuid default null,
  p_customer_id       uuid default null,
  p_discount_code     text default null,
  p_share_code        text default null
)
returns table(group_id uuid, reference text, access_token text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_group_id       uuid := gen_random_uuid();
  v_reference      text;
  v_token          text := new_order_token();
  v_lines          cart_line[] := '{}';
  v_priced         cart_line[] := '{}';
  v_line_json      jsonb;
  v_product        products%rowtype;
  v_qty            integer;
  v_size           text;
  v_color          text;
  v_unit           integer;
  v_unit_no_code   integer;
  v_attempts       integer := 0;
  v_existing       order_groups%rowtype;
  v_code           discount_codes%rowtype;
  v_code_found     boolean := false;
  v_code_eligible  boolean;
  v_any_eligible   boolean := false;
  v_pct            integer;
  v_merchant       uuid;
  v_seq            integer := 0;
  v_order_id       uuid;
  v_order_ref      text;
  v_sub_subtotal   integer;
  v_sub_total      integer;
  v_share_code     text;
  v_grand_subtotal integer := 0;
  v_grand_total    integer := 0;
begin
  if p_idempotency_key is not null then
    select * into v_existing from order_groups g where g.idempotency_key = p_idempotency_key;
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

  if not exists (
    select 1 from pickup_stations ps where ps.id = p_pickup_station_id and ps.active
  ) then
    raise exception 'choose a pickup station';
  end if;

  -- ---- pass 1: lock, validate and price every line ------------------------
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

    if exists (
      select 1 from merchants mm
      where mm.id = v_product.merchant_id and mm.shop_status <> 'open'
    ) then
      raise exception 'this shop is not accepting orders right now';
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

    v_lines := v_lines || row(
      v_product.merchant_id, v_product.id, v_product.name,
      coalesce(v_product.images[1], ''), v_size, v_color, v_qty,
      0, 0
    )::cart_line;
  end loop;

  -- ---- the discount code, resolved against the shops actually in the cart --
  if p_discount_code is not null and length(trim(p_discount_code)) > 0 then
    select * into v_code
    from discount_codes dc
    where upper(dc.code) = upper(trim(p_discount_code))
      and dc.merchant_id in (select distinct l.merchant_id from unnest(v_lines) l)
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

  -- ---- pass 2: price every line, now that the code is known ---------------
  -- Builds a NEW array rather than writing back into v_lines: plpgsql has no
  -- assignable path to a field of a composite sitting inside an array
  -- (`v_lines[i].unit_price_kes := x` does not parse), so the priced rows are
  -- appended to a second array and that one is what gets inserted.
  for v_seq in 1 .. coalesce(array_length(v_lines, 1), 0) loop
    select * into v_product from products where id = v_lines[v_seq].product_id;

    v_code_eligible := v_code_found
      and v_code.merchant_id = v_lines[v_seq].merchant_id
      and (
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
      variant_adj(v_product.size_price_adj,  v_lines[v_seq].size)
    + variant_adj(v_product.color_price_adj, v_lines[v_seq].color)
    );
    v_unit := effective_price(
      v_product.price_kes, v_pct,
      variant_adj(v_product.size_price_adj,  v_lines[v_seq].size)
    + variant_adj(v_product.color_price_adj, v_lines[v_seq].color)
    );

    v_priced := v_priced || row(
      v_lines[v_seq].merchant_id, v_lines[v_seq].product_id, v_lines[v_seq].product_name,
      v_lines[v_seq].image, v_lines[v_seq].size, v_lines[v_seq].color, v_lines[v_seq].qty,
      v_unit, v_unit_no_code
    )::cart_line;

    update products set stock_qty = stock_qty - v_lines[v_seq].qty
      where id = v_lines[v_seq].product_id;
  end loop;

  if v_code_found and not v_any_eligible then
    raise exception 'discount code is no longer valid for this order';
  end if;

  -- ---- the group's reference ----------------------------------------------
  loop
    v_reference := 'PS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
    exit when not exists (select 1 from order_groups g where g.reference = v_reference)
          and not exists (select 1 from orders o where o.reference = v_reference);
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then
      raise exception 'could not generate a unique order reference';
    end if;
  end loop;

  insert into order_groups (
    id, reference, access_token, customer_id, customer_name, customer_phone,
    customer_notes, pickup_station_id, payment_method, payment_status,
    subtotal_kes, total_kes, idempotency_key
  ) values (
    v_group_id, v_reference, v_token, p_customer_id,
    trim(p_customer_name), trim(p_customer_phone), coalesce(p_customer_notes, ''),
    p_pickup_station_id, p_payment_method, 'pending',
    0, 0, p_idempotency_key
  );

  -- ---- fan out: one order per seller --------------------------------------
  v_seq := 0;
  for v_merchant in
    select distinct l.merchant_id from unnest(v_priced) l order by 1
  loop
    v_seq      := v_seq + 1;
    v_order_id := gen_random_uuid();
    v_order_ref := v_reference || '-' || v_seq;

    select coalesce(sum(l.unit_price_no_code_kes * l.qty), 0),
           coalesce(sum(l.unit_price_kes * l.qty), 0)
      into v_sub_subtotal, v_sub_total
      from unnest(v_priced) l where l.merchant_id = v_merchant;

    -- Attribution is per shop, so it is resolved per sub-order. Dropped
    -- silently when it does not resolve, exactly as place_order() does.
    v_share_code := null;
    if p_share_code is not null and length(trim(p_share_code)) > 0 then
      select sl.code into v_share_code
      from share_links sl
      where upper(sl.code) = upper(trim(p_share_code))
        and sl.merchant_id = v_merchant;
    end if;

    insert into orders (
      id, reference, access_token, merchant_id, customer_id, group_id,
      customer_name, customer_phone, customer_notes,
      channel, payment_method, payment_status, subtotal_kes, total_kes,
      discount_code, discount_kes, share_code
    ) values (
      v_order_id, v_order_ref, new_order_token(), v_merchant, p_customer_id, v_group_id,
      trim(p_customer_name), trim(p_customer_phone), coalesce(p_customer_notes, ''),
      'direct', p_payment_method, 'pending', v_sub_subtotal, v_sub_total,
      case when v_code_found and v_code.merchant_id = v_merchant then v_code.code else null end,
      v_sub_subtotal - v_sub_total,
      v_share_code
    );

    insert into order_items (order_id, product_id, product_name, image, size, color, qty, unit_price_kes)
    select v_order_id, l.product_id, l.product_name, l.image, l.size, l.color, l.qty, l.unit_price_kes
    from unnest(v_priced) l where l.merchant_id = v_merchant;

    if v_code_found and v_code.merchant_id = v_merchant then
      insert into discount_redemptions (code_id, order_id, buyer_id, buyer_phone, amount_kes)
      values (v_code.id, v_order_id, p_customer_id, trim(p_customer_phone), v_sub_subtotal - v_sub_total);

      update discount_codes set redemption_count = redemption_count + 1 where id = v_code.id;
    end if;

    v_grand_subtotal := v_grand_subtotal + v_sub_subtotal;
    v_grand_total    := v_grand_total    + v_sub_total;
  end loop;

  update order_groups
     set subtotal_kes = v_grand_subtotal, total_kes = v_grand_total
   where id = v_group_id;

  return query select v_group_id, v_reference, v_token;

exception
  when unique_violation then
    select * into v_existing from order_groups g where g.idempotency_key = p_idempotency_key;
    if found then
      return query select v_existing.id, v_existing.reference, v_existing.access_token;
      return;
    end if;
    raise;
end;
$function$;

-- Same posture as place_order (0024): this decrements stock for something
-- nobody has paid for, so the browser never gets to call it. The place-order
-- Edge Function holds the service_role key and calls it only after Turnstile
-- has confirmed a real browser.
revoke execute on function place_cart_order(text, text, text, uuid, payment_method, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function place_cart_order(text, text, text, uuid, payment_method, jsonb, uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- get_order_group_by_token: the guest's way back in, mirroring 0018's
-- get_order_by_token. The reference alone is not enough — it is short, quoted
-- aloud and printed on a collection slip, so the secret token is what actually
-- authorises the read.
-- ---------------------------------------------------------------------------
create or replace function get_order_group_by_token(p_reference text, p_access_token text)
returns table (
  id             uuid,
  reference      text,
  customer_name  text,
  customer_phone text,
  customer_notes text,
  payment_method payment_method,
  payment_status payment_status,
  subtotal_kes   integer,
  total_kes      integer,
  placed_at      timestamptz,
  station_name   text,
  station_town   text,
  station_address text,
  station_hours  text,
  -- NOT named `orders`: a returns-table column name is in scope for the whole
  -- body, so an output column called `orders` would shadow the orders TABLE the
  -- body selects from. Same class of ambiguity 0040 hit naming reply columns
  -- after the table's own.
  seller_orders  jsonb
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    g.id, g.reference, g.customer_name, g.customer_phone, g.customer_notes,
    g.payment_method, g.payment_status, g.subtotal_kes, g.total_kes, g.placed_at,
    ps.name, ps.town, ps.address, ps.opening_hours,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference',  o.reference,
        'shopName',   m.name,
        'shopHandle', m.handle,
        'totalKes',   o.total_kes,
        'items',      coalesce((
          select jsonb_agg(jsonb_build_object(
            'productName', oi.product_name,
            'image',       oi.image,
            'size',        oi.size,
            'color',       oi.color,
            'qty',         oi.qty,
            'unitPriceKes', oi.unit_price_kes
          ) order by oi.product_name)
          from order_items oi where oi.order_id = o.id
        ), '[]'::jsonb)
      ) order by m.name)
      from orders o
      join merchants m on m.id = o.merchant_id
      where o.group_id = g.id
    ), '[]'::jsonb)
  from order_groups g
  join pickup_stations ps on ps.id = g.pickup_station_id
  where g.reference = p_reference
    and g.access_token = p_access_token;
$fn$;

revoke execute on function get_order_group_by_token(text, text) from public;
grant  execute on function get_order_group_by_token(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Starter stations.
--
-- THESE ARE PLACEHOLDERS. They exist so the checkout has something to list and
-- so the flow can be exercised end to end; the addresses are area-level, not
-- signed agent locations. Replace them with the real ones (and deactivate any
-- that never open) before taking this live.
-- ---------------------------------------------------------------------------
insert into pickup_stations (name, town, address, opening_hours, sort_order)
select * from (values
  ('Nairobi CBD',   'Nairobi', 'Tom Mboya Street, opposite the Fire Station', 'Mon-Sat 8:00-18:00', 10),
  ('Westlands',     'Nairobi', 'Woodvale Grove, Westlands',                   'Mon-Sat 9:00-18:00', 20),
  ('Thika Road',    'Nairobi', 'TRM Drive, Roysambu',                         'Mon-Sat 9:00-18:00', 30),
  ('Mombasa CBD',   'Mombasa', 'Nkrumah Road, near the Old Post Office',      'Mon-Sat 8:30-17:30', 40),
  ('Kisumu Town',   'Kisumu',  'Oginga Odinga Street',                        'Mon-Sat 8:30-17:30', 50),
  ('Nakuru Town',   'Nakuru',  'Kenyatta Avenue',                             'Mon-Sat 8:30-17:30', 60)
) as v(name, town, address, opening_hours, sort_order)
where not exists (select 1 from pickup_stations);
