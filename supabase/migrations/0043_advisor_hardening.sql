-- Advisor follow-up (2026-08-07 health + security check).
--
-- Two items the Supabase linter surfaced, both minor, both closed here:
--
-- 1. log_follow_event() (0034) is a TRIGGER function created `security
--    definer` that, unlike merchant_follower_series right beside it in 0034,
--    never had its default execute revoked. That left it reachable as an RPC
--    (/rest/v1/rpc/log_follow_event) by anon and authenticated. Called
--    directly it runs outside any trigger context (tg_op/OLD/NEW unset) so it
--    errors before writing anything, but a trigger function has no business on
--    the public API surface. Same close-the-surface pattern as 0015/0016.
--
--    Revoking execute does NOT stop the follows insert/delete trigger from
--    firing: a trigger runs in the table owner's context and never checks the
--    session user's EXECUTE privilege (same reason 0015 could revoke execute
--    on handle_new_user without breaking signup).
--
-- 2. discount_code_products.product_id (0035) is a foreign key with no
--    covering index. The code_id side rides the (code_id, product_id) primary
--    key, but a lookup or cascade on product_id alone (e.g. deleting a
--    product) has to seq-scan. Add the covering index.

revoke execute on function public.log_follow_event() from anon, authenticated, public;

create index if not exists discount_code_products_product_id_idx
  on discount_code_products (product_id);
