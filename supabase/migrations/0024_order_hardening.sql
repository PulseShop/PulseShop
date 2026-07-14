-- Two order-placement holes, both found by attacking the live API.
--
-- 1. DENIAL OF INVENTORY. place_order() was callable by `anon` with no captcha
--    and no rate limit, and it decrements stock the moment an order is placed —
--    for an order nobody has paid for. Two unauthenticated curl calls took a
--    live product from 23 units to 21. A short script could therefore walk the
--    catalogue and set every product in every shop to "Sold Out". Nothing is
--    stolen and nothing leaks; the merchants just stop being able to sell.
--
--    The fix is to stop letting the browser reach this function at all. EXECUTE
--    is revoked from anon/authenticated and granted only to service_role, so
--    the ONLY caller is the `place-order` Edge Function, which verifies a
--    Cloudflare Turnstile token before it forwards anything here. That is the
--    same control already protecting login/signup, and it is the only control
--    that means anything on a Supabase endpoint: CORS is browser-enforced (curl
--    sends no Origin) and the anon key is public by design, so "only my app may
--    call this" cannot be expressed as an origin rule.
--
--    Because the function no longer runs as the buyer, it can no longer read
--    auth.uid() — the Edge Function verifies the caller's JWT and passes the id
--    in p_customer_id. That is safe precisely BECAUSE only service_role can
--    call it: an attacker who could forge p_customer_id would need the
--    service-role key, and with that key they would not need this function.
--
-- 2. NO IDEMPOTENCY. Two identical concurrent calls produced two orders and two
--    stock decrements. Every ROW had a unique id — but the buyer's *action* had
--    none, so a double-tap on a slow connection (i.e. the normal condition for
--    this app's users) silently bought the same thing twice. The client now
--    mints one idempotency key per checkout attempt; a replay of that key
--    returns the ORIGINAL order instead of creating a second.

-- Idempotency key. Nullable + partial unique index: the 60 orders placed before
-- this migration have no key and must not collide with each other on null.
alter table orders add column if not exists idempotency_key uuid;

create unique index if not exists orders_idempotency_key_idx
  on orders(idempotency_key)
  where idempotency_key is not null;

-- The 6-arg version has to GO, not just be superseded: leaving it in place
-- would leave the anon-callable bypass it is the entire point of this migration
-- to close.
drop function if exists place_order(text, text, text, order_channel, payment_method, jsonb);

create or replace function place_order(
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_notes   text,
  p_channel          order_channel,
  p_payment_method   payment_method,
  p_items            jsonb,
  p_idempotency_key  uuid default null,
  -- Supplied by the Edge Function after it verifies the caller's JWT. Null for
  -- a genuine guest checkout.
  p_customer_id      uuid default null
)
returns table(order_id uuid, reference text, access_token text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order_id    uuid := gen_random_uuid();
  v_reference   text;
  v_token       text := new_order_token();
  v_merchant_id uuid;
  v_subtotal    integer := 0;
  v_lines       order_line[] := '{}';
  v_line_json   jsonb;
  v_product     products%rowtype;
  v_unit        integer;
  v_qty         integer;
  v_attempts    integer := 0;
  v_existing    orders%rowtype;
begin
  -- Replay of an attempt we already completed: hand back the SAME order rather
  -- than placing a second one. Checked before any stock is touched.
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
  -- Bounds on the work one call can ask for. Nothing legitimate needs more, and
  -- without them a single request can loop over an unbounded item list.
  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many items in one order';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) = 0
     or length(trim(coalesce(p_customer_phone, ''))) = 0 then
    raise exception 'customer name and phone are required';
  end if;

  for v_line_json in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_line_json->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid quantity';
    end if;
    if v_qty > 100 then
      raise exception 'quantity too large';
    end if;

    -- FOR UPDATE: hold the row until commit so two buyers racing for the last
    -- unit cannot both pass the stock check below.
    select * into v_product from products
      where id = (v_line_json->>'product_id')::uuid
      for update;
    if not found then
      raise exception 'product not found: %', v_line_json->>'product_id';
    end if;

    if v_merchant_id is null then
      v_merchant_id := v_product.merchant_id;
    elsif v_product.merchant_id <> v_merchant_id then
      raise exception 'all items in an order must belong to the same shop';
    end if;

    if v_product.stock_qty < v_qty then
      raise exception 'insufficient stock for %', v_product.name;
    end if;

    -- Price is recomputed from the DB, never taken from the cart the client
    -- sent. Mirrors lib/currency.ts discountedPrice() (and migration 0023).
    v_unit := case
      when v_product.discount_pct is not null
        then round(v_product.price_kes * (1 - v_product.discount_pct::numeric / 100))::integer
      else v_product.price_kes
    end;
    v_subtotal := v_subtotal + v_unit * v_qty;

    update products set stock_qty = stock_qty - v_qty where id = v_product.id;

    v_lines := v_lines || row(
      v_product.id, v_product.name, coalesce(v_product.images[1], ''),
      v_line_json->>'size', v_qty, v_unit
    )::order_line;
  end loop;

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
    channel, payment_method, payment_status, subtotal_kes, total_kes
  ) values (
    v_order_id, v_reference, v_token, v_merchant_id, p_customer_id, p_idempotency_key,
    trim(p_customer_name), trim(p_customer_phone), coalesce(p_customer_notes, ''),
    p_channel, p_payment_method, 'pending', v_subtotal, v_subtotal
  );

  insert into order_items (order_id, product_id, product_name, image, size, qty, unit_price_kes)
  select v_order_id, l.product_id, l.product_name, l.image, l.size, l.qty, l.unit_price_kes
  from unnest(v_lines) as l;

  return query select v_order_id, v_reference, v_token;

exception
  -- Two genuinely simultaneous requests carrying the same key: both passed the
  -- replay check above, one won the unique index. The loser must return the
  -- winner's order, not an error — from the buyer's side this is still one tap.
  when unique_violation then
    select * into v_existing from orders o where o.idempotency_key = p_idempotency_key;
    if found then
      return query select v_existing.id, v_existing.reference, v_existing.access_token;
      return;
    end if;
    raise;
end;
$function$;

-- The browser must not be able to reach this. The Edge Function (service_role)
-- is the only caller, and it verifies a Turnstile token first.
revoke execute on function place_order(text, text, text, order_channel, payment_method, jsonb, uuid, uuid) from public, anon, authenticated;
grant  execute on function place_order(text, text, text, order_channel, payment_method, jsonb, uuid, uuid) to service_role;
