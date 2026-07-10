import type { ReviewService } from "../types";
import { requireUserId, supabase } from "./client";

/**
 * Star ratings. The `reviews_refresh_rating` trigger (migration 0009) recomputes
 * products.rating / products.review_count on every write, so after rating the
 * caller just refetches the product to pick up the new average.
 *
 * RLS rejects a merchant rating their own product — the UI hides the control in
 * that case, this is the server-side half of the same rule.
 */
export const reviewsApi: ReviewService = {
  async getMyRating(productId: string): Promise<number | null> {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("reviews")
      .select("stars")
      .eq("user_id", uid)
      .eq("product_id", productId)
      .maybeSingle<{ stars: number }>();
    if (error) throw error;
    return data?.stars ?? null;
  },

  async rateProduct(productId: string, stars: number): Promise<void> {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("reviews")
      .upsert({ user_id: uid, product_id: productId, stars });
    if (error) throw error;
  },
};
