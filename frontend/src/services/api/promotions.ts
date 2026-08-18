import type { Plan, PlanUpgradeRequest, Promotion, StockStatus } from "@/types";
import type { PlanService, PromotionService } from "../types";
import { supabase } from "./client";

/** A row from list_promotions() (migration 0045). */
interface PromotionRow {
  id: string;
  headline: string | null;
  shop_handle: string;
  shop_name: string;
  product_id: string;
  name: string;
  slug: string;
  price_kes: number;
  discount_pct: number | null;
  images: string[] | null;
  image_alt: string[] | null;
  status: StockStatus;
  rating: number | string;
  review_count: number;
}

const toPromotion = (row: PromotionRow): Promotion => ({
  id: row.id,
  headline: row.headline,
  shopSlug: row.shop_handle,
  shopName: row.shop_name,
  productId: row.product_id,
  name: row.name,
  slug: row.slug,
  priceKes: row.price_kes,
  discountPct: row.discount_pct,
  images: row.images ?? [],
  imageAlts: row.image_alt ?? undefined,
  status: row.status,
  rating: Number(row.rating),
  reviewCount: row.review_count,
});

async function currentMerchantId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Not signed in");
  return id;
}

export const promotionsService: PromotionService = {
  async listActive(limit = 6) {
    const { data, error } = await supabase.rpc("list_promotions", { p_limit: limit });
    if (error) throw error;
    return ((data ?? []) as PromotionRow[]).map(toPromotion);
  },

  /**
   * The seller's own, including paused and expired ones.
   *
   * Goes through the same RPC's shape but reads the table directly, because
   * list_promotions() is filtered to the live window by RLS and the dashboard
   * has to show what is NOT running as well.
   */
  async listMine() {
    const merchantId = await currentMerchantId();
    const { data, error } = await supabase
      .from("promotions")
      .select(
        "id, headline, product_id, merchants!inner(handle, name), products!inner(name, slug, price_kes, discount_pct, images, image_alt, status, rating, review_count)",
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    type Joined = {
      id: string;
      headline: string | null;
      product_id: string;
      merchants: { handle: string; name: string };
      products: Omit<PromotionRow, "id" | "headline" | "shop_handle" | "shop_name" | "product_id">;
    };
    return ((data ?? []) as unknown as Joined[]).map((r) =>
      toPromotion({
        id: r.id,
        headline: r.headline,
        shop_handle: r.merchants.handle,
        shop_name: r.merchants.name,
        product_id: r.product_id,
        ...r.products,
      }),
    );
  },

  async create(productId, headline = null) {
    const merchantId = await currentMerchantId();
    const { error } = await supabase.from("promotions").insert({
      merchant_id: merchantId,
      product_id: productId,
      headline: headline?.trim() || null,
    });
    if (error) throw error;
  },

  async remove(id) {
    const { error } = await supabase.from("promotions").delete().eq("id", id);
    if (error) throw error;
  },

  async canPromote() {
    const merchantId = await currentMerchantId();
    const { data, error } = await supabase.rpc("merchant_can_promote", {
      p_merchant_id: merchantId,
    });
    if (error) throw error;
    return data === true;
  },
};

interface PlanRequestRow {
  id: string;
  requested_plan: Exclude<Plan, "explorer">;
  status: PlanUpgradeRequest["status"];
  created_at: string;
}

export const plansService: PlanService = {
  async myRequest() {
    const merchantId = await currentMerchantId();
    const { data, error } = await supabase
      .from("plan_upgrade_requests")
      .select("id, requested_plan, status, created_at")
      .eq("merchant_id", merchantId)
      .eq("status", "pending")
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as PlanRequestRow;
    return {
      id: row.id,
      requestedPlan: row.requested_plan,
      status: row.status,
      createdAt: row.created_at,
    };
  },

  async request(plan) {
    const merchantId = await currentMerchantId();
    const { error } = await supabase
      .from("plan_upgrade_requests")
      .insert({ merchant_id: merchantId, requested_plan: plan });
    // A partial unique index allows one pending request per shop, so a double
    // submit lands here rather than queueing a duplicate for someone to weed out.
    if (error?.code === "23505") throw new Error("You already have a request waiting on us.");
    if (error) throw error;
  },

  async cancelRequest(id) {
    const { error } = await supabase
      .from("plan_upgrade_requests")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) throw error;
  },
};
