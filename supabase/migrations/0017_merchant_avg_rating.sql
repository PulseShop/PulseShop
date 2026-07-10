-- merchantStats() was fetching every product row's rating/review_count just
-- to compute a review-count-weighted average client-side. Move that to a
-- single aggregate query. security invoker is enough — "products public
-- read" RLS already lets anyone read rating/review_count per-row, so this
-- exposes nothing new.
create or replace function merchant_avg_rating(p_merchant_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    round(sum(rating * review_count) / nullif(sum(review_count), 0), 1),
    0
  )
  from products
  where merchant_id = p_merchant_id;
$$;

grant execute on function merchant_avg_rating(uuid) to anon, authenticated;
