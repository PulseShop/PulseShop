import { createClient } from "@supabase/supabase-js";

/**
 * Supabase browser client. Reads the project URL + publishable (anon) key from
 * Vite env. These are safe to ship to the browser — row-level security on the
 * database is what actually guards the data.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when both env vars are present — services/index uses this to pick the adapter. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * createClient() throws "supabaseUrl is required." on an empty URL, and this
 * module is imported eagerly (services/index -> ./api -> here) even when the
 * mock adapter is the one that ends up being used. Without a placeholder the
 * whole app dies at import time with no env vars set — the exact zero-config
 * path the mock exists to support. Nothing ever calls this client in that case:
 * services/index checks isSupabaseConfigured before handing it out.
 */
const PLACEHOLDER_URL = "http://localhost:54321";
const PLACEHOLDER_KEY = "unconfigured-anon-key";

export const supabase = createClient(url || PLACEHOLDER_URL, anonKey || PLACEHOLDER_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Current authenticated merchant's user id, or throws if not signed in. */
export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not signed in");
  return data.user.id;
}
