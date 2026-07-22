-- Server-side shopping cart, linked to the signed-in shopper's UUID.
--
-- Before this migration the pre-checkout cart existed ONLY in the browser
-- (stores/cart.ts, a Zustand store persisted to localStorage under the fixed
-- key "pulseshop-cart"). That key was never scoped to a user id, so on a
-- shared device User B would see and could check out with whatever User A
-- left in the cart. Orders themselves were already correctly scoped
-- (place_order stamps customer_id = auth.uid(), RLS restricts reads to the
-- owner — see 0018_order_access_keys) — this migration brings the cart up to
-- the same standard for signed-in shoppers.
--
-- Guests still get a device-local cart only (there is no auth.users row to
-- key a server row on) — the local store remains the fast, always-available
-- cache for everyone; this table is what a signed-in shopper's cart follows
-- them to a new device with, and what gets wiped from the device on sign-out.
--
-- Deliberately dumb: only product_id/size/qty are stored. Price, stock,
-- name and image are re-read live from `products`/`merchants` on every read
-- (frontend/src/services/api/cart.ts), the same way listProducts already
-- joins merchants(handle) — a cart is a staging area, not a receipt, so it
-- should show today's price and stock, not a snapshot from whenever the item
-- was added. (order_items, by contrast, intentionally freezes price at
-- purchase time — that snapshot IS the receipt.)
--
-- The "cart holds items from one shop at a time" rule stays a client-side UX
-- guard (stores/cart.ts's add()), same as the stock-qty cap on the quantity
-- stepper — nothing here enforces it, because place_order() already
-- re-validates everything (single merchant, live price, live stock) at
-- checkout regardless of what this table happens to hold.
create table cart_items (
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  size       text not null default '',   -- '' = no size chosen (CartItem.size ?? '')
  qty        integer not null check (qty > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id, size)
);

create index cart_items_product_idx on cart_items(product_id);

create trigger cart_items_updated_at
  before update on cart_items
  for each row execute function set_updated_at();

alter table cart_items enable row level security;

-- Each shopper manages only their own cart. `(select auth.uid())` rather than
-- a bare `auth.uid()` matches the perf fix applied to every other RLS policy
-- in 0015_security_hardening (wrapped so Postgres evaluates it once per
-- statement, not once per row).
create policy "cart_items owner all" on cart_items for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
