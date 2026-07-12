import type { User } from "@supabase/supabase-js";
import type { AuthUser } from "@/types";
import { toSocialHandle, toWhatsAppDigits } from "@/lib/phone";
import {
  EmailConfirmationRequiredError,
  type AuthService,
  type Credentials,
  type ShopDetailsInput,
  type ShopperSignupInput,
  type SignupInput,
} from "../types";
import { supabase } from "./client";

/**
 * A merchant profile row is what makes an account a merchant; accounts
 * without one (shopper signups, or Google signups that never finished shop
 * onboarding) resolve as a shopper session.
 */
async function resolveAuthUser(user: User): Promise<AuthUser> {
  const { data: merchant } = await supabase
    .from("merchants")
    .select("name, handle")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    accountType: merchant ? "merchant" : "shopper",
    shopName: merchant?.name ?? "",
    shopSlug: merchant?.handle ?? "",
  };
}

/**
 * Auth backed by Supabase Auth. On merchant signup the shop details are passed
 * as user metadata; a database trigger (handle_new_user) turns that into the
 * merchant profile row. Shopper signups carry account_type='shopper' so the
 * trigger skips the merchant profile.
 */
export const authApi: AuthService = {
  async signup(input: SignupInput, captchaToken?: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        captchaToken,
        data: {
          account_type: "merchant",
          shop_name: input.shopName,
          shop_slug: input.shopSlug,
          city: input.city,
          whatsapp: input.socials.whatsapp ? toWhatsAppDigits(input.socials.whatsapp) : "",
          instagram: input.socials.instagram ? toSocialHandle(input.socials.instagram) : "",
          facebook: input.socials.facebook ? toSocialHandle(input.socials.facebook) : "",
        },
      },
    });
    if (error) throw error;
    const user = data.user;
    if (!user) throw new Error("Signup did not return a user");
    if (!data.session) throw new EmailConfirmationRequiredError(input.email);
    return {
      id: user.id,
      email: user.email ?? input.email,
      accountType: "merchant",
      shopName: input.shopName,
      shopSlug: input.shopSlug,
    };
  },

  async signupShopper(input: ShopperSignupInput, captchaToken?: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        captchaToken,
        data: { account_type: "shopper", name: input.name },
      },
    });
    if (error) throw error;
    const user = data.user;
    if (!user) throw new Error("Signup did not return a user");
    if (!data.session) throw new EmailConfirmationRequiredError(input.email);
    return {
      id: user.id,
      email: user.email ?? input.email,
      accountType: "shopper",
      shopName: "",
      shopSlug: "",
    };
  },

  async login({ email, password }: Credentials, captchaToken?: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });
    if (error) throw error;
    const user = data.user;
    if (!user) throw new Error("Login did not return a user");
    return resolveAuthUser(user);
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async updateEmail(email: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) throw error;
  },

  async resetPassword(email: string, captchaToken?: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Must be on the Supabase Auth "Redirect URLs" allowlist. That allowlist is
      // a real origin control (unlike CORS on the REST API): it's what stops an
      // attacker from having the recovery link deliver its token to their domain.
      redirectTo: `${window.location.origin}/login`,
      captchaToken,
    });
    if (error) throw error;
  },
};

/**
 * Google sign-in/up. Not part of AuthService — the mock backend has no OAuth
 * concept, so pages import these directly and gate rendering on
 * isSupabaseConfigured (see GoogleButton).
 */

/** Starts the Google OAuth redirect. `intent` decides what the callback page
 * does with a brand-new user: "merchant" routes to shop-setup onboarding,
 * "shopper"/"login" just resolve the account as-is (shopper by default). */
export async function loginWithGoogle(intent: "merchant" | "shopper" | "login"): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback?intent=${intent}` },
  });
  if (error) throw error;
}

/** Current Supabase session resolved to an AuthUser, or null if signed out. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return resolveAuthUser(data.user);
}

/** Finishes merchant onboarding for an already-authenticated (e.g. Google)
 * user who has no merchant profile yet. */
export async function completeMerchantOnboarding(input: ShopDetailsInput): Promise<AuthUser> {
  const { data, error } = await supabase.rpc("create_merchant_profile", {
    p_shop_name: input.shopName,
    p_shop_slug: input.shopSlug,
    p_city: input.city,
    p_whatsapp: input.socials.whatsapp ? toWhatsAppDigits(input.socials.whatsapp) : "",
    p_instagram: input.socials.instagram ? toSocialHandle(input.socials.instagram) : "",
    p_facebook: input.socials.facebook ? toSocialHandle(input.socials.facebook) : "",
  });
  if (error) throw error;
  const { data: authData } = await supabase.auth.getUser();
  return {
    id: data.id,
    email: authData.user?.email ?? "",
    accountType: "merchant",
    shopName: data.name,
    shopSlug: data.handle,
  };
}
