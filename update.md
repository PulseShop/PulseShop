# Backend Architecture Audit — Round 2 (2026-07-10)

Scope: everything added since the AUDIT.md pass earlier today — migrations 0008–0014, OAuth
sign-in, reviews, the checkout RPCs — verified **against the live Supabase database**
(project `ztktdjckrppwzvxgnujn`), not just the repo. Also re-ran Supabase security and
performance advisors and re-mapped the frontend-to-backend integration.

---

## STATUS — most of this is now DONE (executed 2026-07-10, MCP write access restored)

Supabase MCP regained write access this session, so the fixes were applied directly instead
of handed off. **Completed automatically:**

- ✅ Applied `0008_oauth_merchant_profile` to the live DB (trigger OAuth guard +
  `create_merchant_profile` RPC both verified live). Google merchant onboarding now works.
- ✅ Deleted the junk `shop-3a346c25` "My Shop" merchant row (was empty: 0 products/orders/
  followers; the auth.users account is untouched, so that user can now onboard cleanly).
- ✅ Applied `0015_security_hardening` — revoked RPC execute on `handle_new_user` /
  `refresh_product_rating`, pinned search_path on `set_updated_at` / `set_product_status`,
  dropped the `media public read` listing policy, wrapped `auth.uid()` in `(select …)`
  across all 13 RLS policies, added the two FK indexes.
- ✅ Applied `0016_tighten_definer_execute` — revoked needless execute on
  `create_merchant_profile` (anon/public) and `rls_auto_enable`.
- ✅ Deleted phantom migrations `0010` and `0011` from the repo (`git rm`).
- ✅ Added `0015` and `0016` migration files to the repo (DB and repo now match).
- ✅ Removed the `shopName !== "My Shop"` workaround in `ShopDetailsOnboardingPage.tsx`.
- ✅ Re-ran advisors: all prior security + performance **WARN**s cleared except the two
  intentional/dashboard items below. Frontend `npm run build` green.

**Still yours to do (can't be done from code — dashboard toggles + product work):**

1. **Auth → turn OFF email autoconfirm** (`mailer_autoconfirm`). Providers → Email.
2. **Auth → enable leaked-password protection** (Passwords). Advisor still warns.
3. Payments backend + webhook (§6 gap 1) — partner work.
4. Decide on `reviews.comment` / `reviewer_name` (0013): build the UI or drop the columns.
5. Shopper order-history linkage (§6 gap 3) — deliberate schema change.

The rest of this document is the original audit detail, kept for reference.

---

## 1. Headline: the repo and the live database have drifted

| Migration | In repo | Applied to live DB | Verdict |
|---|---|---|---|
| 0001–0007 | ✅ | ✅ | OK (verified in earlier pass) |
| 0008_oauth_merchant_profile | ✅ | ❌ **NOT applied** | **P0 — apply now** (details §2) |
| 0009_reviews_and_follower_count | ✅ | ✅ | OK |
| 0010_secure_rls_policies | ✅ | ❌ not applied | **P0 — delete from repo** (phantom schema, §3) |
| 0011_checkout_transaction | ✅ | ❌ not applied | **P0 — delete from repo** (insecure duplicate, §3) |
| 0012 | — | — | numbering gap, nothing missing |
| 0013_add_review_comments | ✅ | ✅ | Applied, but columns unused by any code (§6) |
| 0014_fix_place_order_ambiguous_reference | ✅ | ✅ | OK (verified `orders.reference` fix is live) |

Because migrations are applied by hand in the SQL editor, nothing enforces repo↔DB parity.
Every finding below was checked against the live DB, and rule going forward: **a migration
file merged to `main` must be applied the same day, or marked clearly as not-for-apply.**

---

## 2. P0 — Google OAuth merchant flow is broken in production (0008 not applied)

Two halves, both confirmed live:

1. The live `handle_new_user()` trigger has the 0007 retry logic but **not** the 0008 OAuth
   guard. Every Google signup — merchant *and shopper* intent — silently gets an
   auto-created merchant row named "My Shop" with handle `shop-<uuid8>`.
   **Confirmed damage:** one real junk row exists — handle `shop-3a346c25`, provider
   `google`, created 2026-07-10 17:57 UTC. That junk shop is publicly discoverable on
   `/shops` and at `pulseshop.space/shop-3a346c25`.
2. The `create_merchant_profile()` RPC that [auth.ts:145](frontend/src/services/api/auth.ts#L145)
   calls from the shop-setup onboarding page **does not exist in the live DB**
   (PostgREST returns PGRST202 "function not found"). So the onboarding submit at
   [ShopDetailsOnboardingPage.tsx:90](frontend/src/routes/auth/ShopDetailsOnboardingPage.tsx#L90)
   always fails.

The frontend even carries a workaround for half of this —
[ShopDetailsOnboardingPage.tsx:66](frontend/src/routes/auth/ShopDetailsOnboardingPage.tsx#L66)
routes users to onboarding when `shopName === "My Shop"` — which (a) proves the trigger
guard isn't live, and (b) breaks for any legitimate merchant who actually names their shop
"My Shop".

### Fix (in order, each as its own separate Run in the SQL editor — combined scripts have silently no-opped before)

1. Paste and run **`supabase/migrations/0008_oauth_merchant_profile.sql`** verbatim.
2. Clean up the junk row created by the unguarded trigger (after confirming with the
   affected user — it may be your own test account):
   ```sql
   -- The Google user who got the phantom "My Shop"
   delete from merchants where id = '3a346c25-a103-400a-adf1-017b2430b2ef' and name = 'My Shop';
   ```
   Without this, that user can never finish onboarding: `create_merchant_profile` raises
   "a shop already exists for this account".
3. Once 0008 is live, remove the `user.shopName !== "My Shop"` hack from
   `ShopDetailsOnboardingPage.tsx` — post-0008 OAuth users simply have no merchant row
   until onboarding completes, which is the correct signal (`accountType === "shopper"`).

---

## 3. P0 — Two committed migrations are wrong and must never be applied

### 0010_secure_rls_policies.sql — written against a schema this project doesn't have
References a `cart_items` table and an `orders.user_id` column; neither exists (cart is a
client-side Zustand store; orders have no shopper linkage). Line 1 would error, and if the
schema ever matched, its `orders FOR SELECT USING (auth.uid() = user_id)` policy would
conflict with the real merchant-scoped read model. Its one valid statement (public product
read) already exists from 0001. This is the same phantom-schema artifact family as the
deleted `backend/` service. **Delete the file.**

### 0011_checkout_transaction.sql — an insecure, weaker duplicate of `place_order`
`place_guest_order` is not applied to the DB and nothing in the frontend calls it, but if
anyone ever "catches the DB up" with pending repo migrations it deploys an
anon-callable SECURITY DEFINER function with real vulnerabilities:

- **No `qty > 0` validation.** A negative qty passes the stock check
  (`stock_qty < -3` is false), then `stock_qty - (-3)` *inflates inventory* and produces
  negative order totals. `place_order` (0005/0014) explicitly rejects this; this one doesn't.
- **Per-line rather than aggregate stock check** — the same product split across two lines
  can oversell (each line passes individually).
- **Ignores `discount_pct`** — charges full price where `place_order` applies the discount,
  so totals disagree with the UI.
- **Reference collisions abort orders**: 8 hex chars, no retry loop (place_order does 10
  collision-checked retries on a longer reference).
- Silently skips items whose merchant doesn't match (`IF FOUND` swallow) instead of erroring.

The single-shop `place_order` is the one true checkout path and the frontend uses only it.
**Delete the file.** If multi-merchant cart checkout becomes a real requirement, rewrite it
to `place_order`'s standard (validation, aggregate locking, discounts, collision-checked
references) rather than resurrecting this.

> After deleting 0010/0011, `git log` still shows them — add a line to AUDIT.md or the
> README noting they were never applied, so nobody "restores" them.

---

## 4. P1 — Security hardening on the live DB (from advisors + review)

Run these as one migration (`0015_security_hardening.sql`), pasted as **one single query**
(it's one transaction, unlike the multi-migration case):

```sql
-- 1) Trigger-only functions should not be RPC-callable (advisor: anon/authenticated
--    can execute SECURITY DEFINER). They error if invoked directly today, but the
--    exposure is pointless surface.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.refresh_product_rating() from anon, authenticated, public;

-- 2) Pin search_path on the two remaining mutable-path functions (advisor warning).
alter function public.set_updated_at() set search_path = public;
alter function public.set_product_status() set search_path = public;

-- 3) Stop anonymous listing of the whole media bucket (advisor: public bucket allows
--    listing). Public buckets serve objects by URL without a SELECT policy; the broad
--    policy only enables enumeration via storage.objects.
drop policy "media public read" on storage.objects;

-- 4) Performance: wrap auth.uid() so RLS evaluates it once per query, not per row
--    (advisor: auth_rls_initplan on 13 policies).
alter policy "merchants owner update" on public.merchants
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
alter policy "products owner insert" on public.products
  with check ((select auth.uid()) = merchant_id);
alter policy "products owner update" on public.products
  using ((select auth.uid()) = merchant_id) with check ((select auth.uid()) = merchant_id);
alter policy "products owner delete" on public.products
  using ((select auth.uid()) = merchant_id);
alter policy "orders owner read" on public.orders
  using ((select auth.uid()) = merchant_id);
alter policy "orders owner update" on public.orders
  using ((select auth.uid()) = merchant_id) with check ((select auth.uid()) = merchant_id);
alter policy "order_items owner read" on public.order_items
  using (exists (select 1 from orders o
                 where o.id = order_items.order_id and o.merchant_id = (select auth.uid())));
alter policy "favorites owner all" on public.favorites
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "follows owner all" on public.follows
  using ((select auth.uid()) = follower_id) with check ((select auth.uid()) = follower_id);
alter policy "reviews owner insert" on public.reviews
  with check ((select auth.uid()) = user_id
    and not exists (select 1 from products p
                    where p.id = reviews.product_id and p.merchant_id = (select auth.uid())));
alter policy "reviews owner update" on public.reviews
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "reviews owner delete" on public.reviews
  using ((select auth.uid()) = user_id);

-- 5) Performance: missing FK indexes flagged by the advisor.
create index if not exists order_items_product_idx on public.order_items(product_id);
create index if not exists favorites_product_idx on public.favorites(product_id);
```

Intentionally **kept** anon-executable (by design, don't "fix"):
- `place_order` — guest checkout is a product requirement; the function validates
  everything server-side (same-merchant, stock, price, qty > 0) and always inserts
  `pending`. Residual risk is spam orders / stock-reservation abuse by bots; mitigate
  later with Supabase Auth captcha or a rate limit, not by requiring login.
- `merchant_order_count` / `merchant_follower_count` — public storefront stats; they leak
  only an aggregate count.

### Dashboard settings (not migration-controllable — do these in the Supabase dashboard)
- **Turn `mailer_autoconfirm` OFF** (Auth → Providers → Email). Still on from testing;
  with it on, anyone can create accounts with emails they don't own.
- **Enable leaked-password protection** (Auth → Passwords; advisor warning).

---

## 5. Architecture assessment — what's sound

The overall shape is good and worth preserving:

- **Postgres-as-backend with RLS + SECURITY DEFINER RPCs for cross-boundary writes** is
  the right architecture at this scale. No custom server to operate, and the two earlier
  audit rounds got the trust boundaries right: clients can never insert orders directly
  (only `place_order`), payment_status only moves via the owning merchant (webhook later),
  prices/stock are recomputed server-side.
- **The adapter switch** ([services/index.ts](frontend/src/services/index.ts)) —
  Supabase adapter when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` exist, in-memory mock
  otherwise — keeps zero-config dev working and gives a single seam for every backend call.
- **Denormalized `products.rating`/`review_count` maintained by trigger** (0009) is the
  right read-optimization for the storefront grid, and the merchant-can't-rate-own-product
  rule is enforced in RLS, not just UI.
- **Payments placeholder** ([payments.ts](frontend/src/services/api/payments.ts)) keeps
  secrets out of the client and defines the exact backend contract; critically, the
  client-side "paid" simulation never touches the DB, so fake payments can't corrupt state.

## 6. Frontend-to-backend integration map (current, verified)

| Domain | Frontend entry | Backend mechanism |
|---|---|---|
| Auth (email) | `services/api/auth.ts` signup/login | Supabase Auth + `handle_new_user` trigger creates merchant row from metadata |
| Auth (Google) | `loginWithGoogle` → `/auth/callback` → onboarding page | **Broken until 0008 applied** (§2) |
| Products/merchant CRUD | `services/api/products.ts` | Direct table ops under owner RLS |
| Public storefront | `getShop`/`listShopProducts` by handle | Public-read RLS + `merchant_order_count`/`merchant_follower_count` RPCs |
| Checkout (single + cart) | `services/api/orders.ts` → `place_order` RPC | Atomic validate/lock/decrement/insert, always `pending` |
| Merchant orders | `listOrders`/`updateOrderStatus` | Owner RLS |
| Reviews (stars) | `services/api/reviews.ts` upsert | Owner RLS + rating-refresh trigger |
| Follows/favorites | `services/api/follows.ts`, `favorites.ts` | Owner RLS, device-local cache + DB source of truth |
| Media | `services/api/storage.ts` → `media` bucket | Public read by URL; writes folder-scoped to `auth.uid()` |
| Payments | `payments.ts` → `VITE_PAYMENTS_API` | **Simulated — no backend exists yet** |
| Automation | `automation/*.py` (service-role key) | Server-side only, correct |

### Integration gaps to close (P2, prioritized)

1. **Payments backend is the biggest missing piece.** Recommendation: a single serverless
   endpoint pair (Vercel function or Supabase Edge Function) holding Daraja/PayPal secrets,
   implementing the contract already documented in payments.ts, plus a webhook that flips
   `orders.payment_status` using the service-role key. Until then the app is
   order-taking + chat-channel settlement, which is fine for launch.
2. **`reviews.comment` / `reviewer_name` (0013) are dead columns** — applied to the DB but
   no code reads or writes them. Either build review comments (write path must set
   `reviewer_name` server-side from the auth context, not client input — as written it's
   spoofable free text) or drop the columns. Don't leave a half-schema.
3. **Shopper order history is device-local only** — `orders` has no shopper linkage
   (known limitation from round 1). Needs an optional `customer_id uuid references
   auth.users` set inside `place_order` when `auth.uid()` is non-null, plus a
   "shoppers read own orders" RLS policy. Schema change; do it deliberately.
4. `products_category_idx` is unused so far — leave it; it's what category filtering
   will use once traffic exists.

---

## 7. Action checklist

**SQL editor (one statement block per Run, in this order):**
- [ ] Apply `0008_oauth_merchant_profile.sql`
- [ ] Delete junk merchant row `3a346c25-…` (§2, confirm ownership first)
- [ ] Apply `0015_security_hardening.sql` (§4 — needs to be committed to repo first)

**Repo:**
- [ ] Delete `supabase/migrations/0010_secure_rls_policies.sql`
- [ ] Delete `supabase/migrations/0011_checkout_transaction.sql`
- [ ] Add `0015_security_hardening.sql` from §4
- [ ] Remove the `"My Shop"` workaround in `ShopDetailsOnboardingPage.tsx` (after 0008 is live)

**Supabase dashboard:**
- [ ] Auth → turn OFF email autoconfirm (before real users)
- [ ] Auth → enable leaked-password protection

**Later (product decisions):**
- [ ] Payments backend + webhook (partner)
- [ ] Review comments UI or drop the 0013 columns
- [ ] Shopper order history linkage
