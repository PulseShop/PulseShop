-- place_order: carry the share code the buyer arrived on through to the order.
--
-- Everything here is 0035's function byte-for-byte apart from the new trailing
-- p_share_code parameter and the two places it is used: resolution near the
-- top, and the orders INSERT at the bottom.
--
-- THE ONE RULE THAT MATTERS: a share code is never a reason to reject an
-- order. Unknown code, deleted link, code belonging to a different shop, junk
-- typed into the URL — all of them resolve to null and the order is placed
-- exactly as if the buyer had walked in cold. Attribution is bookkeeping; the
-- sale is the product. Contrast p_discount_code directly above it, which DOES
-- reject, because there the code changes what the buyer pays.
--
-- Signature changes (new trailing param) ⇒ DROP first, same reasoning as 0035:
-- CREATE OR REPLACE would leave 0035's 9-arg version alongside this one, still
-- granted to service_role. This migration and the updated place-order Edge
-- Function ship together.

drop function if exists place_order(text, text, text, order_channel, payment_method, jsonb, uuid, uuid, text);

create or replace function place_order(
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_notes   text,
  p_channel          order_channel,
  p_payment_method   payment_method,
  p_items            jsonb,
  p_idempotency_key  uuid default null,
  p_customer_id      uuid default null,
  p_discount_code    text default null,
  p_share_code       text default null
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
  v_share_code     text := null;
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

      -- Attribution, resolved once the shop is known. Scoped to THIS shop so a
      -- code from shop A cannot be credited against shop B's order, and
      -- silently dropped when it does not resolve — never raised. Not locked
      -- FOR UPDATE either: nothing is decremented, and two orders crediting the
      -- same link is the normal case, not a race.
      if p_share_code is not null and length(trim(p_share_code)) > 0 then
        select sl.code into v_share_code
        from share_links sl
        where upper(sl.code) = upper(trim(p_share_code))
          and sl.merchant_id = v_merchant_id;
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
    discount_code, discount_kes, share_code
  ) values (
    v_order_id, v_reference, v_token, v_merchant_id, p_customer_id, p_idempotency_key,
    trim(p_customer_name), trim(p_customer_phone), coalesce(p_customer_notes, ''),
    p_channel, p_payment_method, 'pending', v_subtotal, v_total,
    case when v_code_found then v_code.code else null end,
    v_subtotal - v_total,
    v_share_code
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

revoke execute on function place_order(text, text, text, order_channel, payment_method, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function place_order(text, text, text, order_channel, payment_method, jsonb, uuid, uuid, text, text) to service_role;
