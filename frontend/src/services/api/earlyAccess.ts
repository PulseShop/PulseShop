import type { EarlyAccessInput, EarlyAccessSignup } from "@/types";
import type { EarlyAccessService } from "../types";
import { supabase } from "./client";

/**
 * Early-access seller registrations (migration 0064).
 *
 * Nothing here is a security control. The INSERT is a plain table write the
 * public RLS policy allows; the read is a definer RPC that refuses everyone not
 * on platform_admins. A submitter holds the anon key and could call the same
 * insert directly, which is exactly what the form does — the row is write-only
 * to the public, so a submitter still cannot read anyone else's registration.
 */

/** A row as admin_list_early_access() (and the table) returns it. */
interface SignupRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  shop_name: string;
  location: string;
  referral: string | null;
  created_at: string;
}

export const earlyAccessApi: EarlyAccessService = {
  async submit(input: EarlyAccessInput): Promise<void> {
    const { error } = await supabase.from("early_access_signups").insert({
      full_name: input.fullName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      shop_name: input.shopName.trim(),
      location: input.location.trim(),
      // Empty optional note stores as NULL, not "", so a real answer and no
      // answer are distinguishable in the control room.
      referral: input.referral?.trim() || null,
    });
    if (error) throw error;
  },

  async list(): Promise<EarlyAccessSignup[]> {
    const { data, error } = await supabase.rpc("admin_list_early_access");
    if (error) throw error;
    return ((data ?? []) as SignupRow[]).map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      shopName: r.shop_name,
      location: r.location,
      referral: r.referral,
      createdAt: r.created_at,
    }));
  },
};
