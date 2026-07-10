-- Follow-up to 0015: remove needless RPC surface on two SECURITY DEFINER
-- functions the advisor still flagged after 0008/0015. Applied to the live DB
-- via MCP on 2026-07-10.

-- create_merchant_profile inherited default PUBLIC execute; only signed-in
-- users should reach it (it raises 'not signed in' for anon anyway).
revoke execute on function public.create_merchant_profile(text, text, text, text, text, text) from anon, public;

-- rls_auto_enable is an event-trigger function; event triggers fire on their
-- own, so no client role ever needs to invoke it via RPC.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
