-- Seller replies to reviews.
--
-- A review is currently a one-way message. The seller sees a two-star complaint
-- about a late delivery in their dashboard and has nowhere to answer it, so the
-- only version of the story a future buyer reads is the complaint. One optional
-- reply per review, shown under it on the public product page.
--
-- Three pieces:
--   1. `reviews.id` — an opaque handle for a single review. The table's PK is
--      (user_id, product_id), and a merchant replying to "the review by user X"
--      would have to be handed X's user_id, which product_reviews() has gone out
--      of its way never to leak (0029). A surrogate id keeps the reply addressable
--      without exposing who wrote it.
--   2. `merchant_reply` / `merchant_replied_at` on the same row rather than a
--      separate table: it is strictly 0-or-1 per review, cascades with it on
--      delete for free, and every reader already selects from `reviews`.
--   3. `reply_to_review()` — the write path. NOT an RLS policy: a policy would
--      have to allow the merchant UPDATE on `reviews`, and RLS cannot restrict
--      WHICH columns an update touches, so the same grant that lets a seller
--      answer a review would let them rewrite its stars and text. A definer
--      function that only ever assigns the two reply columns is the boundary.

alter table reviews
  add column if not exists id uuid not null default gen_random_uuid();

-- Unique, not primary: (user_id, product_id) stays the PK — it is the constraint
-- that enforces "one rating per user per product", and the upsert in
-- rateProduct() conflicts on it.
create unique index if not exists reviews_id_key on reviews(id);

alter table reviews
  add column if not exists merchant_reply     text,
  add column if not exists merchant_replied_at timestamptz;

alter table reviews drop constraint if exists reviews_merchant_reply_len;
alter table reviews add constraint reviews_merchant_reply_len
  check (merchant_reply is null or char_length(merchant_reply) <= 500);

-- ---------------------------------------------------------------------------
-- reply_to_review(review, reply) — post, edit or clear the seller's reply.
--
-- security definer so it can update a row `reviews owner update` (0009) scopes
-- to the review's AUTHOR; the ownership check below is what replaces that
-- policy's guarantee. It keys off (select auth.uid()) — definer changes
-- privilege, not the JWT — so a caller can only ever reply on their own
-- products. Blank/whitespace clears the reply entirely, which is the only way
-- to retract one.
--
-- Returns the stored reply so the caller can render exactly what landed rather
-- than assuming its own optimistic value won.
-- ---------------------------------------------------------------------------
-- The OUT columns are named reply_text / replied_at, NOT merchant_reply /
-- merchant_replied_at: plpgsql turns a `returns table` column into a variable
-- in scope for the whole body, and a variable sharing a name with a column of
-- the table being updated is exactly the ambiguity `#variable_conflict` exists
-- to arbitrate. Not naming them the same thing is cheaper than arbitrating it,
-- and the adapter maps them either way.
drop function if exists reply_to_review(uuid, text);

create or replace function reply_to_review(p_review_id uuid, p_reply text)
returns table (reply_text text, replied_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_text text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  if v_text is not null and char_length(v_text) > 500 then
    raise exception 'reply_too_long';
  end if;

  return query
  update reviews as r
     set merchant_reply      = v_text,
         merchant_replied_at = case when v_text is null then null else now() end
   where r.id = p_review_id
     and exists (
       select 1 from products p
       where p.id = r.product_id
         and p.merchant_id = (select auth.uid())
     )
  returning r.merchant_reply, r.merchant_replied_at;

  -- No row updated means the review does not exist or is not on one of the
  -- caller's products. Deliberately the same error for both: distinguishing
  -- them would turn this into an oracle for "does this review id exist".
  if not found then
    raise exception 'review_not_found';
  end if;
end;
$$;

revoke execute on function reply_to_review(uuid, text) from public, anon;
grant  execute on function reply_to_review(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- product_reviews: return the reply alongside the review.
--
-- Return type changes, so DROP + CREATE, which resets the ACL — the grant at
-- the bottom is load-bearing. Still no user_id: the reply is public, the author
-- is not. Body is the LIVE 0029 body plus the two reply columns.
-- ---------------------------------------------------------------------------
drop function if exists product_reviews(uuid, int);

create or replace function product_reviews(p_product_id uuid, p_limit int default 20)
returns table (
  stars               smallint,
  comment             text,
  reviewer_name       text,
  created_at          timestamptz,
  merchant_reply      text,
  merchant_replied_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.stars, r.comment, r.reviewer_name, r.created_at,
         r.merchant_reply, r.merchant_replied_at
  from reviews r
  where r.product_id = p_product_id
    and r.comment is not null
    and char_length(trim(r.comment)) > 0
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

grant execute on function product_reviews(uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- merchant_reviews: carry the review id (so the dashboard can address a reply
-- to it) and the reply itself (so it can show what was already said).
--
-- Returns jsonb, so this is a plain create-or-replace and the grants stay.
-- Body is the LIVE 0033 body plus three keys.
-- ---------------------------------------------------------------------------
create or replace function merchant_reviews(
  p_product_id uuid default null,
  p_limit      int  default 20,
  p_offset     int  default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select least(greatest(coalesce(p_limit, 20), 1), 50) as lim,
           greatest(coalesce(p_offset, 0), 0)             as off
  ),
  uid as (select auth.uid() as id),
  mine as (
    select
      r.id as review_id,
      r.product_id,
      p.name as product_name,
      coalesce(p.images[1], '') as image,
      r.stars,
      r.comment,
      r.reviewer_name,
      r.created_at,
      r.merchant_reply,
      r.merchant_replied_at
    from reviews r
    join products p on p.id = r.product_id
    where p.merchant_id = (select id from uid)
      and (p_product_id is null or r.product_id = p_product_id)
  ),
  dist as (
    select
      count(*)                          as total,
      coalesce(round(avg(stars), 1), 0) as avg_rating,
      count(*) filter (where stars = 1) as s1,
      count(*) filter (where stars = 2) as s2,
      count(*) filter (where stars = 3) as s3,
      count(*) filter (where stars = 4) as s4,
      count(*) filter (where stars = 5) as s5
    from mine
  ),
  page as (
    select * from mine
    order by created_at desc
    limit  (select lim from bounds)
    offset (select off from bounds)
  )
  select jsonb_build_object(
    'avgRating', (select avg_rating from dist),
    'totalReviews', (select total from dist),
    'distribution', jsonb_build_object(
      '1', (select s1 from dist), '2', (select s2 from dist), '3', (select s3 from dist),
      '4', (select s4 from dist), '5', (select s5 from dist)
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reviewId', review_id,
        'productId', product_id,
        'productName', product_name,
        'image', image,
        'stars', stars,
        'comment', comment,
        'reviewerName', reviewer_name,
        'createdAt', created_at,
        'merchantReply', merchant_reply,
        'merchantRepliedAt', merchant_replied_at
      ) order by created_at desc)
      from page
    ), '[]'::jsonb),
    'totalCount', (select total from dist)
  );
$$;

revoke execute on function merchant_reviews(uuid, int, int) from public, anon;
grant  execute on function merchant_reviews(uuid, int, int) to authenticated;
