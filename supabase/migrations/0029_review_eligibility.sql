-- Purchase-gated reviews + surfacing review text on the product page.
--
-- Two gaps this closes:
--   1. ANY signed-in shopper could rate ANY product — "reviews owner insert"
--      (0009) only checked ownership of the row and that it wasn't the rater's
--      own shop. The rule the business wants is "you can only review what you
--      bought", and the client is not a boundary: it has to be enforced in RLS.
--   2. reviews.comment / reviews.reviewer_name (0013) were dead columns. The
--      product page shows star averages but never the written reviews behind
--      them. product_reviews() feeds a public reviews list.
--
-- "Bought" here means "has an order containing this product, any status".
-- Payments are simulated and orders are fulfilled over WhatsApp, so an order
-- never reaches a paid/confirmed state — gating on that would mean no one could
-- ever review. Placing the order is the eligibility signal we actually have.

-- ---------------------------------------------------------------------------
-- has_purchased(product) — did the CALLER order this product?
--
-- security definer so it reads orders/order_items past their owner-only RLS,
-- and reliably regardless of the caller's own row visibility. It still keys off
-- (select auth.uid()) — definer changes privilege, not the JWT — so it only
-- ever reveals whether the *caller* bought the product, never anyone else. That
-- also makes it the exact check the UI needs to decide whether to show the
-- review form, so the same rule lives in one place.
-- ---------------------------------------------------------------------------
create or replace function has_purchased(p_product uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from order_items oi
    join orders o on o.id = oi.order_id
    where oi.product_id = p_product
      and o.customer_id = (select auth.uid())
  );
$$;

revoke execute on function has_purchased(uuid) from public, anon;
grant execute on function has_purchased(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tighten the insert gate: own rating + not your own shop + you bought it.
-- Upsert (INSERT ... ON CONFLICT DO UPDATE) re-checks this WITH CHECK on the
-- re-rating path too, which is fine — the buyer still owns the order.
-- ---------------------------------------------------------------------------
drop policy if exists "reviews owner insert" on reviews;
create policy "reviews owner insert" on reviews for insert
  with check (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from products p
      where p.id = product_id and p.merchant_id = (select auth.uid())
    )
    and has_purchased(product_id)
  );

-- ---------------------------------------------------------------------------
-- Shape guards for the newly-live text columns (mirrors 0021's field CHECKs).
-- ---------------------------------------------------------------------------
alter table reviews drop constraint if exists reviews_comment_len;
alter table reviews add constraint reviews_comment_len
  check (comment is null or char_length(comment) <= 500);

alter table reviews drop constraint if exists reviews_reviewer_name_len;
alter table reviews add constraint reviews_reviewer_name_len
  check (reviewer_name is null or char_length(reviewer_name) <= 80);

-- ---------------------------------------------------------------------------
-- product_reviews(product) — the written reviews for a product page.
--
-- security definer + an explicit column list so it returns ONLY the safe fields
-- (stars, comment, reviewer_name, created_at) and never user_id — same privacy
-- reasoning as the seo_* readers in 0028. Only rows with actual text; a bare
-- star rating has nothing to display in a reviews list.
-- ---------------------------------------------------------------------------
create or replace function product_reviews(p_product_id uuid, p_limit int default 20)
returns table(stars smallint, comment text, reviewer_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.stars, r.comment, r.reviewer_name, r.created_at
  from reviews r
  where r.product_id = p_product_id
    and r.comment is not null
    and char_length(trim(r.comment)) > 0
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

grant execute on function product_reviews(uuid, int) to anon, authenticated;
