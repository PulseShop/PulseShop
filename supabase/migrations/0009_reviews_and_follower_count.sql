-- Interactive star ratings + the merchant-facing follower count.
--
-- Two gaps this closes:
--  1. products.rating / products.review_count were static columns nothing ever
--     wrote to, so the star row on the product page was decorative. A `reviews`
--     table now owns the truth and a trigger keeps the denormalised columns on
--     `products` in sync (they stay, so the storefront grid still reads a rating
--     without an extra aggregate per card).
--  2. The dashboard had no way to show followers: `follows` RLS scopes rows to
--     the *follower*, so a merchant counting rows on their own shop reads 0.
--     Same shape of fix as merchant_order_count() in 0005.

-- ---------------------------------------------------------------------------
-- reviews  (one star rating per user per product)
-- ---------------------------------------------------------------------------
create table reviews (
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index reviews_product_idx on reviews(product_id);

create trigger reviews_updated_at
  before update on reviews
  for each row execute function set_updated_at();

alter table reviews enable row level security;

-- Ratings are public (they feed the average everyone sees).
create policy "reviews public read" on reviews for select using (true);

-- You may only write your own rating, and never on your own shop's products —
-- otherwise a merchant could five-star their whole catalogue.
create policy "reviews owner insert" on reviews for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from products p where p.id = product_id and p.merchant_id = auth.uid()
    )
  );

create policy "reviews owner update" on reviews for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "reviews owner delete" on reviews for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Keep products.rating / products.review_count fed from `reviews`.
--
-- security definer because the writer is a *shopper*, and "products owner
-- update" RLS only lets the owning merchant update a product row. Without it
-- every rating insert would silently leave the aggregate untouched.
--
-- Note this UPDATE does not touch stock_qty, so the products_set_status trigger
-- (before update OF stock_qty) does not fire.
-- ---------------------------------------------------------------------------
create or replace function refresh_product_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_product_id uuid;
begin
  -- NEW is unassigned on DELETE; reading new.product_id there would raise.
  if tg_op = 'DELETE' then
    v_product_id := old.product_id;
  else
    v_product_id := new.product_id;
  end if;

  update products p set
    rating = coalesce(
      (select round(avg(r.stars)::numeric, 1) from reviews r where r.product_id = v_product_id),
      0
    ),
    review_count = (select count(*) from reviews r where r.product_id = v_product_id)
  where p.id = v_product_id;

  return null;
end;
$$;

create trigger reviews_refresh_rating
  after insert or update or delete on reviews
  for each row execute function refresh_product_rating();

-- ---------------------------------------------------------------------------
-- Follower count without exposing who the followers are.
-- ---------------------------------------------------------------------------
create or replace function merchant_follower_count(p_merchant_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*) from follows where merchant_id = p_merchant_id;
$$;

grant execute on function merchant_follower_count(uuid) to anon, authenticated;
