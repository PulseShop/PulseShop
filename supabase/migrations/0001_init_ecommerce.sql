-- PulseShop e-commerce schema
-- Mirrors the frontend data model in frontend/src/types & services/types.
-- Auth model: each auth.users row is a MERCHANT. Shoppers browse/order as guests.

-- ---------------------------------------------------------------------------
-- Enums (match the string unions in the frontend)
-- ---------------------------------------------------------------------------
create type stock_status  as enum ('available', 'low', 'out');
create type order_channel  as enum ('whatsapp', 'instagram', 'facebook', 'direct');
create type payment_method as enum ('mpesa', 'paypal');
create type payment_status as enum ('idle', 'pending', 'paid', 'failed');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- merchants  (profile extending auth.users -> Merchant / AuthUser)
-- ---------------------------------------------------------------------------
create table merchants (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,                       -- shopName / Merchant.name
  handle     text not null unique,                -- shopSlug / Merchant.handle
  bio        text default '',
  location   text default '',                     -- signup.city / Merchant.location
  avatar_url text default '',
  is_online  boolean not null default true,
  whatsapp   text default '',
  instagram  text default '',
  facebook   text default '',
  rating     numeric(2,1) not null default 0 check (rating >= 0 and rating <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger merchants_updated_at
  before update on merchants
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- products  (-> Product / ProductInput)
-- ---------------------------------------------------------------------------
create table products (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants(id) on delete cascade,
  name         text not null,
  sku          text not null,
  category     text not null,
  price_kes    integer not null check (price_kes >= 0),
  discount_pct integer check (discount_pct between 0 and 100),   -- nullable
  stock_qty    integer not null default 0 check (stock_qty >= 0),
  -- derived from stock_qty by trigger (LOW_STOCK_THRESHOLD = 5 in lib/constants.ts)
  status       stock_status not null default 'out',
  images       text[] not null default '{}',
  sizes        text[],                                            -- nullable
  rating       numeric(2,1) not null default 0 check (rating >= 0 and rating <= 5),
  review_count integer not null default 0 check (review_count >= 0),
  description  text default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (merchant_id, sku)
);

create index products_merchant_idx on products(merchant_id);
create index products_category_idx on products(category);

create trigger products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- Keep products.status in sync with stock_qty on every write.
create or replace function set_product_status()
returns trigger language plpgsql as $$
begin
  new.status := case
    when new.stock_qty <= 0 then 'out'
    when new.stock_qty <= 5 then 'low'
    else 'available'
  end::stock_status;
  return new;
end;
$$;

create trigger products_set_status
  before insert or update of stock_qty on products
  for each row execute function set_product_status();

-- ---------------------------------------------------------------------------
-- orders  (header -> OrderDraft.customer/channel/payment + PlacedOrder)
-- ---------------------------------------------------------------------------
create table orders (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,                 -- PlacedOrder.reference
  merchant_id    uuid not null references merchants(id) on delete cascade,
  customer_name  text not null,
  customer_phone text not null,
  customer_notes text default '',
  channel        order_channel not null default 'direct',
  payment_method payment_method,                       -- nullable
  payment_status payment_status not null default 'pending',
  subtotal_kes   integer not null default 0 check (subtotal_kes >= 0),
  total_kes      integer not null default 0 check (total_kes >= 0),
  placed_at      timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index orders_merchant_idx on orders(merchant_id);

-- ---------------------------------------------------------------------------
-- order_items  (cart lines -> CartItem; a single-product order has one row)
-- ---------------------------------------------------------------------------
create table order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  product_id     uuid references products(id) on delete set null,
  product_name   text not null,                        -- snapshot at order time
  image          text default '',
  size           text,                                 -- nullable
  qty            integer not null check (qty > 0),
  unit_price_kes integer not null check (unit_price_kes >= 0),
  line_total_kes integer generated always as (unit_price_kes * qty) stored
);

create index order_items_order_idx on order_items(order_id);

-- ---------------------------------------------------------------------------
-- favorites  (-> Favorite; per authenticated user, device sync)
-- ---------------------------------------------------------------------------
create table favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Auto-create the merchant profile when a user signs up.
-- Reads shop details from auth user metadata (set by the signup adapter).
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into merchants (id, name, handle, location, whatsapp, instagram, facebook)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'shop_name', 'My Shop'),
    coalesce(new.raw_user_meta_data->>'shop_slug', 'shop-' || left(new.id::text, 8)),
    coalesce(new.raw_user_meta_data->>'city', ''),
    coalesce(new.raw_user_meta_data->>'whatsapp', ''),
    coalesce(new.raw_user_meta_data->>'instagram', ''),
    coalesce(new.raw_user_meta_data->>'facebook', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table merchants   enable row level security;
alter table products    enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;
alter table favorites   enable row level security;

-- merchants: public storefront can read shops; owner manages own row
create policy "merchants public read"   on merchants for select using (true);
create policy "merchants owner update"  on merchants for update using (auth.uid() = id) with check (auth.uid() = id);

-- products: public storefront read; merchant writes only their own products
create policy "products public read"    on products for select using (true);
create policy "products owner insert"   on products for insert with check (auth.uid() = merchant_id);
create policy "products owner update"   on products for update using (auth.uid() = merchant_id) with check (auth.uid() = merchant_id);
create policy "products owner delete"   on products for delete using (auth.uid() = merchant_id);

-- orders: guest shoppers place orders (public insert); merchant reads/updates own
create policy "orders public insert"    on orders for insert with check (true);
create policy "orders owner read"       on orders for select using (auth.uid() = merchant_id);
create policy "orders owner update"     on orders for update using (auth.uid() = merchant_id) with check (auth.uid() = merchant_id);

-- order_items: inserted alongside a guest order; readable by the owning merchant
create policy "order_items public insert" on order_items for insert with check (true);
create policy "order_items owner read"    on order_items for select
  using (exists (select 1 from orders o where o.id = order_id and o.merchant_id = auth.uid()));

-- favorites: each user manages only their own
create policy "favorites owner all" on favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
