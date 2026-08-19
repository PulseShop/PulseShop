import type {
  AdminPlacement,
  AdminProductHit,
  AdminShop,
  GrowthPoint,
  Paged,
  PlacementInput,
  Plan,
  PlatformStats,
  StockStatus,
} from "@/types";
import type { AdminService } from "../types";
import { supabase } from "./client";

/**
 * The owner dashboard's data (migrations 0047 and 0048).
 *
 * Nothing in this file is a security control. Every RPC below asserts
 * is_platform_admin() before it reads or writes anything, so a non-admin
 * calling them straight over PostgREST gets the same refusal this does. The
 * page uses `isAdmin()` only to choose between rendering a dashboard and
 * rendering "not authorised".
 *
 * That applies to the WRITES as much as the reads. setShopPlan() moves a shop
 * between tiers and savePlacement() puts a product on the marketplace banner —
 * neither is expressible as a table write from the browser, because
 * `authenticated` holds no UPDATE privilege on merchants.plan (0041) and no
 * write privilege on banner_placements at all (0048). The functions are the
 * only door, and they check who is knocking.
 */

/** A row from platform_growth(). */
interface GrowthRow {
  day: string;
  sellers: number;
  shoppers: number;
  sellers_total: number;
  shoppers_total: number;
}

/** A row from admin_list_shops(). */
interface ShopRow {
  id: string;
  name: string;
  handle: string;
  email: string | null;
  plan: Plan;
  shop_status: AdminShop["shopStatus"];
  location: string | null;
  avatar_url: string | null;
  created_at: string;
  product_count: number;
  order_count: number;
  gross_kes: number | string;
  banner_count: number;
  total_count: number | string;
}

/** A row from admin_list_banner_placements(). */
interface PlacementRow {
  id: string;
  product_id: string;
  headline: string | null;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  amount_kes: number | null;
  note: string | null;
  created_at: string;
  sort_order: number;
  live: boolean;
  product_name: string;
  product_slug: string;
  product_image: string | null;
  price_kes: number;
  status: StockStatus;
  merchant_id: string;
  shop_name: string;
  shop_handle: string;
  shop_plan: Plan;
}

/** A row from admin_search_products(). */
interface ProductHitRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price_kes: number;
  status: StockStatus;
  image: string | null;
  shop_name: string;
  shop_handle: string;
  shop_plan: Plan;
  already_placed: boolean;
}

const DEFAULT_PAGE_SIZE = 20;

export const adminApi: AdminService = {
  async isAdmin() {
    // Not signed in at all is a plain "no", not an error worth surfacing.
    const { data: session } = await supabase.auth.getUser();
    if (!session.user) return false;

    const { data, error } = await supabase.rpc("is_platform_admin");
    if (error) return false;
    return data === true;
  },

  async stats() {
    const { data, error } = await supabase.rpc("platform_stats");
    if (error) throw error;
    return data as PlatformStats;
  },

  async growth(days = 30): Promise<GrowthPoint[]> {
    const { data, error } = await supabase.rpc("platform_growth", { p_days: days });
    if (error) throw error;
    return ((data ?? []) as GrowthRow[]).map((r) => ({
      day: r.day,
      sellers: r.sellers,
      shoppers: r.shoppers,
      sellersTotal: r.sellers_total,
      shoppersTotal: r.shoppers_total,
    }));
  },

  async listShops(query = {}): Promise<Paged<AdminShop>> {
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = Math.max(1, query.page ?? 1);
    const { data, error } = await supabase.rpc("admin_list_shops", {
      // "all" is spelt as null on the wire, which is also the parameter's
      // default, so an unfiltered call carries no plan at all.
      p_plan: !query.plan || query.plan === "all" ? null : query.plan,
      p_search: query.search?.trim() ?? "",
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    if (error) throw error;

    const rows = (data ?? []) as ShopRow[];
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        handle: r.handle,
        email: r.email,
        plan: r.plan,
        shopStatus: r.shop_status,
        location: r.location ?? "",
        avatarUrl: r.avatar_url ?? "",
        createdAt: r.created_at,
        productCount: Number(r.product_count ?? 0),
        orderCount: Number(r.order_count ?? 0),
        // bigint comes back as a string over PostgREST once it is large enough,
        // so this is Number() rather than a cast.
        grossKes: Number(r.gross_kes ?? 0),
        bannerCount: Number(r.banner_count ?? 0),
      })),
      // total_count is repeated on every row; absent when the page is empty.
      total: Number(rows[0]?.total_count ?? 0),
    };
  },

  async setShopPlan(merchantId: string, plan: Plan): Promise<void> {
    const { error } = await supabase.rpc("admin_set_shop_plan", {
      p_merchant_id: merchantId,
      p_plan: plan,
    });
    if (error) throw error;
  },

  async listPlacements(): Promise<AdminPlacement[]> {
    const { data, error } = await supabase.rpc("admin_list_banner_placements");
    if (error) throw error;
    return ((data ?? []) as PlacementRow[]).map((r) => ({
      id: r.id,
      productId: r.product_id,
      headline: r.headline,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      active: r.active,
      amountKes: r.amount_kes,
      note: r.note,
      createdAt: r.created_at,
      sortOrder: r.sort_order,
      live: r.live,
      productName: r.product_name,
      productSlug: r.product_slug,
      productImage: r.product_image,
      priceKes: r.price_kes,
      status: r.status,
      merchantId: r.merchant_id,
      shopName: r.shop_name,
      shopHandle: r.shop_handle,
      shopPlan: r.shop_plan,
    }));
  },

  async savePlacement(input: PlacementInput): Promise<string> {
    const { data, error } = await supabase.rpc("admin_upsert_banner_placement", {
      p_id: input.id ?? null,
      p_product_id: input.productId,
      p_headline: input.headline ?? null,
      p_starts_at: input.startsAt ?? null,
      p_ends_at: input.endsAt ?? null,
      p_active: input.active ?? true,
      p_amount_kes: input.amountKes ?? null,
      p_note: input.note ?? null,
      p_sort_order: input.sortOrder ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  async deletePlacement(id: string): Promise<void> {
    const { error } = await supabase.rpc("admin_delete_banner_placement", { p_id: id });
    if (error) throw error;
  },

  async reorderPlacements(ids: string[]): Promise<void> {
    const { error } = await supabase.rpc("admin_reorder_banner_placements", { p_ids: ids });
    if (error) throw error;
  },

  async searchProducts(search: string, limit = 12): Promise<AdminProductHit[]> {
    const { data, error } = await supabase.rpc("admin_search_products", {
      p_search: search.trim(),
      p_limit: limit,
    });
    if (error) throw error;
    return ((data ?? []) as ProductHitRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      sku: r.sku,
      priceKes: r.price_kes,
      status: r.status,
      image: r.image,
      shopName: r.shop_name,
      shopHandle: r.shop_handle,
      shopPlan: r.shop_plan,
      alreadyPlaced: r.already_placed,
    }));
  },
};
