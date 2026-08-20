-- Share links: the attribution substrate.
--
-- Every social channel PulseShop speaks to is currently an exit. A seller
-- posts a product link to their WhatsApp Status, someone buys, and nothing
-- anywhere records that those two events were the same story. This table is
-- what makes them one row.
--
-- SHAPE: one link per (merchant, product, channel, label). Re-sharing the same
-- product to the same channel returns the SAME code rather than minting a new
-- one, because the seller's question is "what does my Status earn me", not
-- "what did this particular tap earn me". `label` is the escape hatch for a
-- seller who does want to split one channel into several campaigns.
--
-- WHY A CODE AND NOT A QUERY PARAM: ?ref=x survives being pasted into a
-- browser and almost nothing else. WhatsApp Status has no link stickers at
-- all, so the URL has to be short enough to be READ OFF A PHONE SCREEN and
-- typed. pulseshop.space/s/K3QF9 is; a product URL with a UTM tail is not.
--
-- PRIVACY: no per-click row, no IP, no device fingerprint. A counter on the
-- link and a code on the order is the whole ledger, which answers the seller's
-- question without building a tracking database about buyers.

create table share_links (
  id          uuid primary key default gen_random_uuid(),
  -- Globally unique, not per-shop: this resolves with no shop context at all
  -- (that is the point of /s/CODE), so two shops cannot share a code.
  -- Unambiguous alphabet only — no O/0/I/1, because these get read aloud and
  -- typed from a Status screenshot.
  code        text not null unique check (code ~ '^[A-Z2-9]{5,10}$'),
  merchant_id uuid not null references merchants(id) on delete cascade,
  -- Null = a link to the shop itself rather than to one product.
  product_id  uuid references products(id) on delete cascade,
  channel     text not null default 'other'
              check (channel in ('whatsapp', 'status', 'instagram', 'facebook', 'tiktok', 'other')),
  label       text not null default '' check (char_length(label) <= 40),
  click_count int not null default 0 check (click_count >= 0),
  created_at  timestamptz not null default now()
);

-- The idempotency key for ensure_share_link(). Coalesced product_id because a
-- shop-wide link has none and null never equals null in a unique index.
create unique index share_links_owner_target_idx
  on share_links (merchant_id, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid), channel, label);
create index share_links_merchant_idx on share_links(merchant_id);

alter table share_links enable row level security;

-- Sellers read and manage their own links directly; the buyer side never
-- selects from this table at all, it goes through resolve_share_link() below.
-- A public-read policy here would expose every shop's campaign labels and
-- click counts to anyone with the anon key.
create policy "share_links owner all" on share_links for all
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

-- ---------------------------------------------------------------------------
-- orders.share_code: which link the buyer arrived on.
--
-- Deliberately the CODE and not a foreign key to share_links.id. A seller who
-- deletes a campaign link should not have the orders it earned silently
-- rewritten to "no source" — the history of what happened is not the seller's
-- to edit. Denormalised text survives the link being deleted.
-- ---------------------------------------------------------------------------
alter table orders
  add column if not exists share_code text;

create index if not exists orders_share_code_idx on orders(share_code) where share_code is not null;

-- ---------------------------------------------------------------------------
-- new_share_code: a short, unambiguous code. Same collision-checked-in-a-loop
-- shape as new_order_token()/place_order's reference generator.
-- ---------------------------------------------------------------------------
create or replace function new_share_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  -- No O, 0, I or 1. These codes are read off a phone screen and typed.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_attempts int := 0;
begin
  loop
    v_code := '';
    for _i in 1..5 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from share_links sl where sl.code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'could not generate a unique share code';
    end if;
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- ensure_share_link: get-or-create, so the share sheet can call it on every
-- open without accumulating a code per tap.
--
-- Security definer because it generates the code (which needs to see every
-- existing code, across shops, to check for collisions) — but it refuses to
-- act for anyone but the product's own merchant, checked against auth.uid()
-- rather than against a parameter the caller supplies.
-- ---------------------------------------------------------------------------
create or replace function ensure_share_link(
  p_product_id uuid default null,
  p_channel    text default 'other',
  p_label      text default ''
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_merchant_id uuid;
  v_label       text := coalesce(trim(p_label), '');
  v_code        text;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if p_channel is null or p_channel not in ('whatsapp', 'status', 'instagram', 'facebook', 'tiktok', 'other') then
    raise exception 'unknown share channel';
  end if;
  if char_length(v_label) > 40 then
    raise exception 'label is too long';
  end if;

  if p_product_id is null then
    -- A shop-wide link. The caller must own a shop; that shop is the target.
    if not exists (select 1 from merchants m where m.id = v_uid) then
      raise exception 'not a seller';
    end if;
    v_merchant_id := v_uid;
  else
    select p.merchant_id into v_merchant_id from products p where p.id = p_product_id;
    if not found then
      raise exception 'product not found';
    end if;
    -- The whole authorisation check: you may only mint links for your own
    -- products. Anyone else sharing gets the plain product URL client-side.
    if v_merchant_id <> v_uid then
      raise exception 'not your product';
    end if;
  end if;

  select sl.code into v_code
  from share_links sl
  where sl.merchant_id = v_merchant_id
    and sl.product_id is not distinct from p_product_id
    and sl.channel = p_channel
    and sl.label = v_label;

  if found then
    return v_code;
  end if;

  v_code := new_share_code();
  insert into share_links (code, merchant_id, product_id, channel, label)
  values (v_code, v_merchant_id, p_product_id, p_channel, v_label)
  -- Two share sheets opened at once race here; the loser takes the winner's
  -- code rather than erroring, since either one answers the caller's question.
  on conflict (merchant_id, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid), channel, label)
  do update set channel = excluded.channel
  returning share_links.code into v_code;

  return v_code;
end;
$$;

revoke execute on function ensure_share_link(uuid, text, text) from public, anon;
grant  execute on function ensure_share_link(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- resolve_share_link: what /s/CODE calls. Counts the click and says where to
-- go. Anon-callable by necessity — the entire point is a stranger opening a
-- link from someone's Status.
--
-- Returns null for an unknown code rather than raising, so a mistyped code is
-- a 404 page and not an error toast.
--
-- The counter is best-effort by design: it is incremented once per resolve,
-- and a buyer who opens the link three times counts three times. Deduplicating
-- would mean identifying the device, which is exactly the tracking this
-- deliberately does not do.
-- ---------------------------------------------------------------------------
create or replace function resolve_share_link(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_link     share_links%rowtype;
  v_product  products%rowtype;
  v_merchant merchants%rowtype;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return null;
  end if;

  update share_links sl
     set click_count = sl.click_count + 1
   where upper(sl.code) = upper(trim(p_code))
  returning * into v_link;

  if not found then
    return null;
  end if;

  select * into v_merchant from merchants m where m.id = v_link.merchant_id;
  if not found then
    return null;
  end if;

  if v_link.product_id is not null then
    select * into v_product from products p where p.id = v_link.product_id;
  end if;

  return jsonb_build_object(
    'code',        v_link.code,
    'shopSlug',    v_merchant.handle,
    'shopName',    v_merchant.name,
    'productId',   v_product.id,
    'productSlug', v_product.slug,
    'channel',     v_link.channel
  );
end;
$$;

revoke execute on function resolve_share_link(text) from public;
grant  execute on function resolve_share_link(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- share_link_performance: the seller's answer to "which post paid?".
--
-- Orders are joined on the denormalised code, so a link that was deleted still
-- reports nothing while the orders it earned keep their attribution for the
-- Orders page. Revenue counts PAID orders only — a pending order is a claim,
-- not money, and a channel report that counts claims flatters whichever
-- channel attracts the most window shoppers.
-- ---------------------------------------------------------------------------
create or replace function share_link_performance()
returns table (
  id           uuid,
  code         text,
  product_id   uuid,
  product_name text,
  channel      text,
  label        text,
  click_count  int,
  order_count  bigint,
  revenue_kes  bigint,
  created_at   timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    sl.id,
    sl.code,
    sl.product_id,
    coalesce(p.name, ''),
    sl.channel,
    sl.label,
    sl.click_count,
    count(o.id) filter (where o.id is not null),
    coalesce(sum(o.total_kes) filter (where o.payment_status = 'paid'), 0),
    sl.created_at
  from share_links sl
  left join products p on p.id = sl.product_id
  left join orders o on upper(o.share_code) = sl.code and o.merchant_id = sl.merchant_id
  group by sl.id, p.name
  order by sl.created_at desc;
$$;

-- security invoker: share_links RLS already scopes this to the caller's own
-- links, and orders RLS to their own orders. No extra privilege needed.
grant execute on function share_link_performance() to authenticated;
