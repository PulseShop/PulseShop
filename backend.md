# PulseShop — Backend Plan & Platform Decision

> **How to use this document:** Read Section 1 for the decision, then execute the phases in Section 6 **after** the frontend (UI_design.md) Phase 4 is complete. The frontend's `services/api/` adapter is built against the API contract in Section 4.

---

## 1. Decision: Supabase + Vercel (recommended) vs Docker self-hosted

### Option A — Supabase + Vercel ✅ **Recommended**

| Need | How it's covered |
|---|---|
| Database | Supabase Postgres (managed, free tier, daily backups) |
| Merchant auth | Supabase Auth (email/password + magic link) out of the box |
| Product images | Supabase Storage bucket + CDN + image transforms |
| **Live "DB Synced" stock updates** | **Supabase Realtime** — the dashboard's orange→green pulse maps directly to a realtime write confirmation; storefront stock badges update live |
| Payment APIs (M-Pesa, PayPal) | Vercel serverless functions in `backend/api/` — keeps secrets off the client, handles M-Pesa callbacks |
| Hosting the PWA | Vercel static hosting (HTTPS by default — required for PWA + M-Pesa callbacks) |
| Cost / ops | Free tiers cover development and early production; zero server maintenance |

### Option B — Docker self-hosted (Node/Express + MySQL + Nginx)

Full control and true MySQL, but **you** own auth, realtime (websockets), file storage, backups, TLS certificates, and a VPS. That's weeks of infrastructure work that Option A gives you for free, and M-Pesa's callback URL requires a stable public HTTPS endpoint — trivial on Vercel, another chore on a VPS.

**Choose Docker only if:** you need on-premise data residency, hard MySQL requirement, or expect to outgrow Supabase's pricing. The service-layer design in UI_design.md means you can migrate later without touching UI code.

> **Note on "MySQL" in the UI spec:** the dashboard's *DB Synced* indicator was described against MySQL. With Option A the database is **Postgres** — the UX is identical (and easier, via Supabase Realtime). Keep the indicator; only the engine changes.

### Hybrid note (best of both)
Even with Option A, local development uses Docker under the hood: `supabase start` runs the entire stack (Postgres, Auth, Storage, Realtime) in local Docker containers. You develop fully offline and `supabase db push` to production.

---

## 2. Architecture

```
Browser (PulseShop PWA, Vercel-hosted)
   │
   ├─► Supabase JS client ──► Postgres (RLS-protected)  ─┐
   │                          Auth / Storage / Realtime  │ Supabase project
   │                                                     ┘
   └─► /api/* (Vercel serverless, backend/ folder)
          ├─ POST /api/orders            create order
          ├─ POST /api/pay/mpesa         Daraja STK push initiate
          ├─ POST /api/pay/mpesa/callback  Daraja result webhook
          ├─ POST /api/pay/paypal        create PayPal order
          └─ POST /api/pay/paypal/capture  capture after approval
```

- **Reads** (products, merchant profile) go straight from the client to Supabase with anon key + Row Level Security.
- **Writes with money or secrets** (orders, payments) go through Vercel functions using the service-role key.

## 3. Database Schema (Postgres / Supabase)

```sql
create table merchants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users not null,
  name text not null, handle text unique not null,
  bio text, location text, avatar_url text,
  is_online boolean default false,
  whatsapp text, instagram text, facebook text,
  created_at timestamptz default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references merchants not null,
  name text not null, sku text not null, category text not null,
  description text, price_kes numeric(10,2) not null,
  discount_pct numeric(4,1),          -- null = no discount
  stock_qty int not null default 0,   -- realtime-watched column
  sizes text[],                        -- null = not sized
  images text[] not null default '{}',
  rating numeric(2,1) default 0, review_count int default 0,
  created_at timestamptz default now(),
  unique (merchant_id, sku)
);
-- status is derived, not stored: out (=0) / low (<=5) / available

create table orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references merchants not null,
  product_id uuid references products not null,
  size text, qty int not null default 1,
  customer_name text not null, customer_phone text not null, notes text,
  channel text not null check (channel in ('whatsapp','instagram','facebook','direct')),
  amount_kes numeric(10,2) not null,
  payment_method text check (payment_method in ('mpesa','paypal')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','pending','paid','failed')),
  payment_ref text,                    -- M-Pesa receipt / PayPal capture id
  created_at timestamptz default now()
);

create table favorites (                -- optional server sync; localStorage is primary for guests
  device_id text not null,
  product_id uuid references products not null,
  created_at timestamptz default now(),
  primary key (device_id, product_id)
);
```

**Row Level Security (enable on every table):**
- `products`, `merchants`: public `select`; `insert/update/delete` only where `merchant_id` belongs to `auth.uid()`.
- `orders`: no public read; insert via service role only (Vercel functions); merchants read their own.
- Storage bucket `product-images`: public read, authenticated merchant write.

**Realtime:** publish `products` table; dashboard subscribes to its merchant's rows (drives the DB Synced pulse on confirmation), storefront subscribes to `stock_qty` changes.

## 4. API Contract (what `frontend/src/services/api/` implements)

| Endpoint | Body | Returns |
|---|---|---|
| `GET` products / merchant | — (direct Supabase query) | `Product[]`, `Merchant` |
| `POST /api/orders` | `{ productId, size, qty, customer, channel }` | `{ orderId, amountKes }` |
| `POST /api/pay/mpesa` | `{ orderId, phone }` | `{ checkoutRequestId }` → client polls order status or listens via Realtime |
| `POST /api/pay/mpesa/callback` | Daraja payload (webhook) | updates `payment_status`, decrements `stock_qty` |
| `POST /api/pay/paypal` | `{ orderId }` | `{ paypalOrderId, approveUrl }` |
| `POST /api/pay/paypal/capture` | `{ orderId, paypalOrderId }` | `{ status: 'paid' }`, decrements stock |

**Stock decrement rule:** only on `paid` (direct payments) — channel orders (WhatsApp/IG/FB) decrement when the merchant marks the order confirmed in the dashboard.

## 5. Payments Integration Notes

### M-Pesa (Safaricom Daraja API)
1. Create a Daraja app → **sandbox** consumer key/secret; use STK Push (`Lipa na M-Pesa Online`).
2. Flow: `POST /api/pay/mpesa` gets an OAuth token, fires STK push to the customer's phone, stores `checkout_request_id`, sets order `pending`.
3. Daraja calls `/api/pay/mpesa/callback` (must be public HTTPS — Vercel URL works, sandbox-test with the Daraja simulator). Validate the payload, match `checkout_request_id`, set `paid`/`failed`, store the M-Pesa receipt number.
4. Frontend shows the pending → paid transition via Supabase Realtime on the order row (matches the UI spec's payment sheet states).
5. Go-live requires a registered paybill/till + Safaricom vetting — keep sandbox until then.

### PayPal
1. PayPal Developer sandbox app → client id/secret. Use **Orders v2 API** (create server-side, approve client-side with `@paypal/react-paypal-js`, capture server-side).
2. Never expose the secret client-side; only the client id goes in frontend env.
3. KES is not a PayPal settlement currency — price in KES, charge PayPal in USD via a conversion rate constant (document it in the order record).

## 6. Build Phases

| Phase | Work | Done when |
|---|---|---|
| **B0. Setup** | Create Supabase project; `supabase init` + `supabase start` in `backend/`; link Vercel project to repo | local stack runs in Docker; `frontend` deploys to a Vercel preview URL |
| **B1. Schema + RLS** | Migrations for Section 3; seed script mirroring the 12 mock products; storage bucket | frontend `services/api/` reads real products |
| **B2. Auth + dashboard writes** | Merchant sign-in; product CRUD + image upload + discount writes with RLS; Realtime pulse wired | dashboard fully live, mock adapter deleted for dashboard |
| **B3. Orders + payments** | Vercel functions for orders, M-Pesa sandbox, PayPal sandbox; Realtime order status | end-to-end paid order in sandbox for both methods |
| **B4. Hardening** | webhook signature/origin validation, rate limiting, error logging, backup check, load test stock decrement race (use a Postgres `update … where stock_qty >= qty` guard) | security checklist passes |

## 7. Environment Variables

```
# frontend/.env                      # safe to expose /but repo will be private
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PAYPAL_CLIENT_ID=

# Vercel project env (server only)   # never in the repo or client bundle
SUPABASE_SERVICE_ROLE_KEY=
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
MPESA_PASSKEY=
PAYPAL_CLIENT_SECRET=
```
