import type { AuthUser } from "@/types";
import type { AuthService, Credentials, ShopperSignupInput, SignupInput } from "../types";
import { supabase } from "./client";

/**
 * Auth backed by Supabase Auth. On merchant signup the shop details are passed
 * as user metadata; a database trigger (handle_new_user) turns that into the
 * merchant profile row. Shopper signups carry account_type='shopper' so the
 * trigger skips the merchant profile.
 */
export const authApi: AuthService = {
  async signup(input: SignupInput): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          account_type: "merchant",
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
      accountType: "merchant",
      shopName: input.shopName,
      shopSlug: input.shopSlug,
    };
  },

  async signupShopper(input: ShopperSignupInput): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { account_type: "shopper", name: input.name },
      },
    });
    if (error) throw error;
    const user = data.user;
    if (!user) throw new Error("Signup did not return a user");
    return {
      id: user.id,
      email: user.email ?? input.email,
      accountType: "shopper",
      shopName: "",
      shopSlug: "",
    };
  },

  async login({ email, password }: Credentials): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = data.user;
    if (!user) throw new Error("Login did not return a user");

    // A merchant profile row is what makes an account a merchant; accounts
    // without one (shopper signups) get a shopper session.
    const { data: merchant } = await supabase
      .from("merchants")
      .select("name, handle")
      .eq("id", user.id)
      .maybeSingle();

    return {
      id: user.id,
      email: user.email ?? email,
      accountType: merchant ? "merchant" : "shopper",
      shopName: merchant?.name ?? "",
      shopSlug: merchant?.handle ?? "",
    };
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async updateEmail(email: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) throw error;
  },
};
