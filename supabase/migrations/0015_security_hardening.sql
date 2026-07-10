-- Security + performance hardening from the round-2 backend audit (2026-07-10).
-- Applied to the live DB via MCP the same day. Addresses Supabase advisor
-- findings: RPC-exposed trigger functions, mutable search_path, a public
-- storage bucket that allowed listing, per-row auth.uid() re-evaluation in RLS,
-- and unindexed foreign keys.

-- 1) Trigger-only functions should not be RPC-callable.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.refresh_product_rating() from anon, authenticated, public;

-- 2) Pin search_path on the two remaining mutable-path functions.
alter function public.set_updated_at() set search_path = public;
alter function public.set_product_status() set search_path = public;

-- 3) Stop anonymous listing of the whole media bucket. Public buckets serve
--    objects by URL without a SELECT policy; the broad policy only enabled
--    enumeration of every file via storage.objects.
drop policy "media public read" on storage.objects;

-- 4) Performance: evaluate auth.uid() once per query instead of once per row.
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

-- 5) Performance: covering indexes for foreign keys flagged by the advisor.
create index if not exists order_items_product_idx on public.order_items(product_id);
create index if not exists favorites_product_idx on public.favorites(product_id);
