import type { Merchant } from "@/types";
import type { FollowService } from "../types";
import { requireUserId, supabase } from "./client";
import { type MerchantRow, toMerchant } from "./mappers";

/**
 * Shop discovery + follows. The shop list is public (merchants RLS allows
 * anyone to read); follow/unfollow require a signed-in user and RLS scopes
 * rows to that user.
 */
export const followsApi: FollowService = {
  async listShops(): Promise<Merchant[]> {
    const { data, error } = await supabase
      .from("merchants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    // Stats aren't shown on the discover list — skip the per-shop count queries.
    return (data as MerchantRow[]).map((row) => toMerchant(row, { products: 0, orders: 0 }));
  },

  async listFollowing(): Promise<string[]> {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("follows")
      .select("merchant_id")
      .eq("follower_id", uid);
    if (error) throw error;
    return (data as { merchant_id: string }[]).map((r) => r.merchant_id);
  },

  async follow(merchantId: string): Promise<void> {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("follows")
      .upsert({ follower_id: uid, merchant_id: merchantId });
    if (error) throw error;
  },

  async unfollow(merchantId: string): Promise<void> {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", uid)
      .eq("merchant_id", merchantId);
    if (error) throw error;
  },
};
