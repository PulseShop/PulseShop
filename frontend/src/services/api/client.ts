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

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** Current authenticated merchant's user id, or throws if not signed in. */
export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not signed in");
  return data.user.id;
}
