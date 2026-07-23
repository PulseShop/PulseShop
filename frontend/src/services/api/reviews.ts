import type { ProductReview } from "@/types";
import type { ReviewService } from "../types";
import { requireUserId, supabase } from "./client";

/**
 * Star ratings + written reviews. The `reviews_refresh_rating` trigger (0009)
 * recomputes products.rating / products.review_count on every write, so after
 * rating the caller just refetches the product to pick up the new average.
 *
 * Only a buyer who ORDERED the product may review it (migration 0029): RLS
 * enforces it on write via has_purchased(), and canReview() surfaces the same
 * check to the UI. A merchant still can't rate their own product either.
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

  async canReview(productId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("has_purchased", { p_product: productId });
    if (error) throw error;
    return Boolean(data);
  },

  async rateProduct(productId: string, stars: number, comment?: string | null): Promise<void> {
    const uid = await requireUserId();
    const row: Record<string, unknown> = { user_id: uid, product_id: productId, stars };

    // Only touch the text columns when a comment was actually passed — omitting
    // them from the upsert payload leaves any existing review unchanged, so a
    // quick star re-rate doesn't wipe the words the buyer wrote earlier.
    if (comment !== undefined) {
      const trimmed = comment?.trim() ?? "";
      row.comment = trimmed.length > 0 ? trimmed : null;
      // Denormalise the reviewer's display name onto the row: the product page
      // is public and can't read another user's private auth metadata.
      const { data: u } = await supabase.auth.getUser();
      const meta = (u.user?.user_metadata ?? {}) as { name?: string; full_name?: string };
      row.reviewer_name = meta.name || meta.full_name || null;
    }

    const { error } = await supabase.from("reviews").upsert(row);
    if (error) throw error;
  },

  async listReviews(productId: string): Promise<ProductReview[]> {
    const { data, error } = await supabase.rpc("product_reviews", {
      p_product_id: productId,
      p_limit: 20,
    });
    if (error) throw error;
    return ((data ?? []) as {
      stars: number;
      comment: string;
      reviewer_name: string | null;
      created_at: string;
    }[]).map((r) => ({
      stars: r.stars,
      comment: r.comment,
      reviewerName: r.reviewer_name,
      createdAt: r.created_at,
    }));
  },
};
