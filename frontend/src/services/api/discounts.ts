import type { DiscountCode, DiscountPreview } from "@/types";
import type { DiscountCodeInput, DiscountService } from "../types";
import { requireUserId, supabase } from "./client";

/**
 * Seller-created discount codes (migration 0035).
 *
 * Create/update/delete go straight through the client — `discount_codes`
 * owner-scoped RLS is the whole boundary, no RPC needed. previewCode is the
 * one method a BUYER calls (before checkout, possibly signed out), which is
 * why it's the only one here that doesn't touch these tables directly —
 * it's a security-definer RPC instead (0035), so a guest can check a code
 * without discount_codes ever being readable by anyone but its owner.
 */
interface DiscountCodeRow {
  id: string;
  code: string;
  percent_off: number;
  starts_at: string;
  expires_at: string;
  max_redemptions: number | null;
  redemption_count: number;
  applies_to: "all" | "selected";
  active: boolean;
  created_at: string;
}

function toDiscountCode(row: DiscountCodeRow, productIds: string[]): DiscountCode {
  return {
    id: row.id,
    code: row.code,
    percentOff: row.percent_off,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    appliesTo: row.applies_to,
    productIds,
    active: row.active,
    createdAt: row.created_at,
  };
}

/** The product ids linked to one 'selected' code. Empty for an 'all' code —
 * callers skip the query entirely rather than asking for an always-empty set. */
async function productIdsFor(codeId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("discount_code_products")
    .select("product_id")
    .eq("code_id", codeId);
  if (error) throw error;
  return (data as { product_id: string }[]).map((l) => l.product_id);
}

export const discountsApi: DiscountService = {
  async listCodes(): Promise<DiscountCode[]> {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("discount_codes")
      .select("*")
      .eq("merchant_id", uid)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as DiscountCodeRow[];

    // Only 'selected' codes need the product-membership join — most shops
    // will mostly use 'all' codes, which skip it entirely.
    const selectedIds = rows.filter((r) => r.applies_to === "selected").map((r) => r.id);
    const byCode = new Map<string, string[]>();
    if (selectedIds.length > 0) {
      const { data: links, error: linkErr } = await supabase
        .from("discount_code_products")
        .select("code_id, product_id")
        .in("code_id", selectedIds);
      if (linkErr) throw linkErr;
      for (const l of (links ?? []) as { code_id: string; product_id: string }[]) {
        const arr = byCode.get(l.code_id) ?? [];
        arr.push(l.product_id);
        byCode.set(l.code_id, arr);
      }
    }

    return rows.map((r) => toDiscountCode(r, byCode.get(r.id) ?? []));
  },

  async createCode(input: DiscountCodeInput): Promise<DiscountCode> {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("discount_codes")
      .insert({
        merchant_id: uid,
        code: input.code.trim().toUpperCase(),
        percent_off: input.percentOff,
        starts_at: input.startsAt ?? new Date().toISOString(),
        expires_at: input.expiresAt,
        max_redemptions: input.maxRedemptions ?? null,
        applies_to: input.appliesTo,
        active: input.active ?? true,
      })
      .select("*")
      .single<DiscountCodeRow>();
    if (error) throw error;

    let productIds: string[] = [];
    if (input.appliesTo === "selected" && input.productIds?.length) {
      const { error: linkErr } = await supabase
        .from("discount_code_products")
        .insert(input.productIds.map((productId) => ({ code_id: data.id, product_id: productId })));
      if (linkErr) throw linkErr;
      productIds = input.productIds;
    }

    return toDiscountCode(data, productIds);
  },

  async updateCode(id: string, patch: Partial<DiscountCodeInput>): Promise<DiscountCode> {
    const uid = await requireUserId();
    const row: Record<string, unknown> = {};
    if (patch.code !== undefined) row.code = patch.code.trim().toUpperCase();
    if (patch.percentOff !== undefined) row.percent_off = patch.percentOff;
    if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
    if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;
    if (patch.maxRedemptions !== undefined) row.max_redemptions = patch.maxRedemptions;
    if (patch.appliesTo !== undefined) row.applies_to = patch.appliesTo;
    if (patch.active !== undefined) row.active = patch.active;

    const { data, error } = await supabase
      .from("discount_codes")
      .update(row)
      .eq("id", id)
      .eq("merchant_id", uid)
      .select("*")
      .single<DiscountCodeRow>();
    if (error) throw error;

    // Replace wholesale when the seller edited the product list — simplest
    // correct semantics for a list short enough to always re-send in full.
    if (patch.productIds !== undefined) {
      const { error: delErr } = await supabase
        .from("discount_code_products")
        .delete()
        .eq("code_id", id);
      if (delErr) throw delErr;
      if (patch.productIds.length > 0) {
        const { error: insErr } = await supabase
          .from("discount_code_products")
          .insert(patch.productIds.map((productId) => ({ code_id: id, product_id: productId })));
        if (insErr) throw insErr;
      }
    }

    // Re-read the current links rather than trust `patch` — this call may not
    // have touched productIds at all, and the previous value must still come
    // back correctly rather than default to empty.
    const productIds = data.applies_to === "selected" ? await productIdsFor(id) : [];
    return toDiscountCode(data, productIds);
  },

  async deleteCode(id: string): Promise<void> {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("discount_codes")
      .delete()
      .eq("id", id)
      .eq("merchant_id", uid);
    if (error) throw error;
  },

  async previewCode(
    merchantId: string,
    code: string,
    items: { productId: string; qty: number }[],
    customerPhone?: string,
  ): Promise<DiscountPreview> {
    const { data, error } = await supabase.rpc("preview_discount_code", {
      p_merchant_id: merchantId,
      p_code: code,
      p_items: items.map((i) => ({ product_id: i.productId, qty: i.qty })),
      p_customer_phone: customerPhone || null,
    });
    if (error) throw error;
    return data as DiscountPreview;
  },
};
