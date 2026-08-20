import type { GroupBuy, GroupBuyStatus, MerchantGroupBuy } from "@/types";
import type { GroupBuyInput, GroupBuyService } from "../types";
import { productImageSrc } from "@/lib/productImage";
import { requireUserId, supabase } from "./client";

/**
 * Group buys (migration 0054).
 *
 * Everything goes through RPCs, including the seller-facing reads. Both public
 * calls (`get_group_buy`, `join_group_buy`) have to work for a stranger with
 * no session who arrived from a WhatsApp group, and both touch tables that
 * must never be readable from the client: `group_buy_members` is a list of
 * phone numbers, and `group_buys` carries the earned discount code, which the
 * server hands out only to members.
 */

/** The jsonb shape group_buy_json() builds. Already camelCase — the function
 * assembles it for this consumer rather than projecting raw columns. */
interface GroupBuyPayload {
  code: string;
  status: GroupBuyStatus;
  targetCount: number;
  memberCount: number;
  percentOff: number;
  closesAt: string;
  isMember: boolean;
  discountCode: string | null;
  productId: string;
  productName: string;
  productSlug: string;
  productImage: string;
  stockQty: number;
  priceKes: number;
  groupPriceKes: number;
  shopSlug: string;
  shopName: string;
}

function toGroupBuy(p: GroupBuyPayload): GroupBuy {
  return {
    ...p,
    memberCount: Number(p.memberCount ?? 0),
    // Through the same placeholder path as every other product image, so a
    // group buy on a product with no photo doesn't render a broken <img>.
    productImage: productImageSrc(p.productImage ? [p.productImage] : []),
  };
}

interface MerchantRow {
  id: string;
  code: string;
  product_id: string;
  product_name: string;
  product_image: string;
  target_count: number;
  member_count: number;
  percent_off: number;
  closes_at: string;
  status: GroupBuyStatus;
  discount_code: string | null;
  created_at: string;
}

export const groupBuysApi: GroupBuyService = {
  async getByCode(code: string, phone?: string | null): Promise<GroupBuy | null> {
    const { data, error } = await supabase.rpc("get_group_buy", {
      p_code: code,
      p_phone: phone ?? null,
    });
    if (error) throw error;
    return data ? toGroupBuy(data as GroupBuyPayload) : null;
  },

  async activeForProduct(productId: string): Promise<GroupBuy | null> {
    const { data, error } = await supabase.rpc("active_group_buy_for_product", {
      p_product_id: productId,
    });
    if (error) throw error;
    return data ? toGroupBuy(data as GroupBuyPayload) : null;
  },

  async join(code: string, name: string, phone: string, qty = 1): Promise<GroupBuy> {
    const { data, error } = await supabase.rpc("join_group_buy", {
      p_code: code,
      p_name: name,
      p_phone: phone,
      p_qty: qty,
    });
    if (error) throw error;
    return toGroupBuy(data as GroupBuyPayload);
  },

  async listMine(): Promise<MerchantGroupBuy[]> {
    // Asserts a session so a signed-out caller gets the same "Not signed in"
    // as every other merchant-facing method, rather than an empty list.
    await requireUserId();
    const { data, error } = await supabase.rpc("merchant_group_buys");
    if (error) throw error;
    return ((data ?? []) as MerchantRow[]).map((r) => ({
      id: r.id,
      code: r.code,
      productId: r.product_id,
      productName: r.product_name,
      productImage: productImageSrc(r.product_image ? [r.product_image] : []),
      targetCount: r.target_count,
      memberCount: Number(r.member_count ?? 0),
      percentOff: r.percent_off,
      closesAt: r.closes_at,
      status: r.status,
      discountCode: r.discount_code,
      createdAt: r.created_at,
    }));
  },

  async create(input: GroupBuyInput): Promise<string> {
    const { data, error } = await supabase.rpc("create_group_buy", {
      p_product_id: input.productId,
      p_target_count: input.targetCount,
      p_percent_off: input.percentOff,
      p_hours: input.hours,
    });
    if (error) throw error;
    return data as string;
  },

  async cancel(id: string): Promise<void> {
    const { error } = await supabase.rpc("cancel_group_buy", { p_id: id });
    if (error) throw error;
  },
};
