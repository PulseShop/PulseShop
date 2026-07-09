import type { AuthUser } from "@/types";
import type { AuthService, Credentials, SignupInput } from "../types";
import { supabase } from "./client";

/**
 * Merchant auth backed by Supabase Auth. On signup the shop details are passed
 * as user metadata; a database trigger (handle_new_user) turns that into the
 * merchant profile row, so no extra insert is needed here.
 */
export const authApi: AuthService = {
  async signup(input: SignupInput): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          shop_name: input.shopName,
          shop_slug: input.shopSlug,
          city: input.city,
          whatsapp: input.socials.whatsapp,
          instagram: input.socials.instagram,
          facebook: input.socials.facebook,
        },
      },
    });
    if (error) throw error;
    const user = data.user;
    if (!user) throw new Error("Signup did not return a user");
    return {
      id: user.id,
      email: user.email ?? input.email,
      shopName: input.shopName,
      shopSlug: input.shopSlug,
    };
  },

  async login({ email, password }: Credentials): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = data.user;
    if (!user) throw new Error("Login did not return a user");

    // Pull the shop name/handle from the merchant profile for the session.
    const { data: merchant } = await supabase
      .from("merchants")
      .select("name, handle")
      .eq("id", user.id)
      .single();

    return {
      id: user.id,
      email: user.email ?? email,
      shopName: merchant?.name ?? "My Shop",
      shopSlug: merchant?.handle ?? "",
    };
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
