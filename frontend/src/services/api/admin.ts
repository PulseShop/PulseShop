import type {
  AdminInvoice,
  AdminPayment,
  AdminPlacement,
  AdminProductHit,
  AdminShop,
  AdminTopProduct,
  BillingSummary,
  GrowthPoint,
  InvoiceInput,
  PaymentInput,
  RepeatCustomerRate,
  RevenuePoint,
  SocialLinks,
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

/** A row from admin_list_invoices(). */
interface InvoiceRow {
  id: string;
  merchant_id: string;
  shop_name: string;
  shop_handle: string;
  plan: Plan;
  period_start: string;
  period_end: string;
  amount_kes: number;
  paid_kes: number | string;
  balance_kes: number | string;
  status: AdminInvoice["status"];
  state: AdminInvoice["state"];
  issued_at: string | null;
  due_on: string | null;
  note: string | null;
  created_at: string;
  total_count: number | string;
}

/** A row from admin_list_payments(). */
interface PaymentRow {
  id: string;
  invoice_id: string;
  merchant_id: string;
  shop_name: string;
  shop_handle: string;
  plan: Plan;
  amount_kes: number;
  method: AdminPayment["method"];
  reference: string | null;
  paid_at: string;
  note: string | null;
  period_start: string;
  period_end: string;
  total_count: number | string;
}

/** A row from admin_top_products(). */
interface TopProductRow {
  product_id: string;
  name: string;
  image: string | null;
  shop_name: string;
  units: number | string;
  revenue_kes: number | string;
  rating: number | string | null;
  review_count: number | null;
}

/** A row from admin_revenue_series(). */
interface RevenueRow {
  day: string;
  gross_kes: number | string;
  orders: number | string;
}

/** The shape platform_settings holds before anybody fills it in. */
const EMPTY_SOCIALS: SocialLinks = {
  facebook: "",
  x: "",
  tiktok: "",
  instagram: "",
  linkedin: "",
  youtube: "",
};

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

  async searchProducts(search: string, limit = 24): Promise<AdminProductHit[]> {
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
  /* --- Subscription billing (migration 0051) ---------------------------- */

  async listInvoices(query = {}): Promise<Paged<AdminInvoice>> {
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const page = Math.max(1, query.page ?? 1);
    const { data, error } = await supabase.rpc("admin_list_invoices", {
      p_status: !query.status || query.status === "all" ? null : query.status,
      p_search: query.search?.trim() ?? "",
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    if (error) throw error;

    const rows = (data ?? []) as InvoiceRow[];
    return {
      items: rows.map((r) => ({
        id: r.id,
        merchantId: r.merchant_id,
        shopName: r.shop_name,
        shopHandle: r.shop_handle,
        plan: r.plan,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        amountKes: Number(r.amount_kes ?? 0),
        // bigint over PostgREST arrives as a string once it is large enough.
        paidKes: Number(r.paid_kes ?? 0),
        balanceKes: Number(r.balance_kes ?? 0),
        status: r.status,
        state: r.state,
        issuedAt: r.issued_at,
        dueOn: r.due_on,
        note: r.note,
        createdAt: r.created_at,
      })),
      total: Number(rows[0]?.total_count ?? 0),
    };
  },

  async saveInvoice(input: InvoiceInput): Promise<string> {
    const { data, error } = await supabase.rpc("admin_upsert_invoice", {
      p_id: input.id ?? null,
      p_merchant_id: input.merchantId,
      p_plan: input.plan,
      p_period_start: input.periodStart,
      p_period_end: input.periodEnd,
      p_amount_kes: input.amountKes,
      p_status: input.status ?? "draft",
      p_due_on: input.dueOn ?? null,
      p_note: input.note ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  async deleteInvoice(id: string): Promise<void> {
    const { error } = await supabase.rpc("admin_delete_invoice", { p_id: id });
    if (error) throw error;
  },

  async listPayments(query = {}): Promise<Paged<AdminPayment>> {
    const pageSize = query.pageSize ?? 50;
    const page = Math.max(1, query.page ?? 1);
    const { data, error } = await supabase.rpc("admin_list_payments", {
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    if (error) throw error;

    const rows = (data ?? []) as PaymentRow[];
    return {
      items: rows.map((r) => ({
        id: r.id,
        invoiceId: r.invoice_id,
        merchantId: r.merchant_id,
        shopName: r.shop_name,
        shopHandle: r.shop_handle,
        plan: r.plan,
        amountKes: Number(r.amount_kes ?? 0),
        method: r.method,
        reference: r.reference,
        paidAt: r.paid_at,
        note: r.note,
        periodStart: r.period_start,
        periodEnd: r.period_end,
      })),
      total: Number(rows[0]?.total_count ?? 0),
    };
  },

  async recordPayment(input: PaymentInput): Promise<string> {
    const { data, error } = await supabase.rpc("admin_record_payment", {
      p_invoice_id: input.invoiceId,
      p_amount_kes: input.amountKes,
      p_method: input.method ?? "mpesa",
      p_reference: input.reference ?? null,
      p_paid_at: input.paidAt ?? null,
      p_note: input.note ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  async deletePayment(id: string): Promise<void> {
    const { error } = await supabase.rpc("admin_delete_payment", { p_id: id });
    if (error) throw error;
  },

  async billingSummary(): Promise<BillingSummary> {
    const { data, error } = await supabase.rpc("admin_billing_summary");
    if (error) throw error;
    return data as BillingSummary;
  },

  /* --- Dashboard reads --------------------------------------------------- */

  async topProducts(days = 30, limit = 8): Promise<AdminTopProduct[]> {
    const { data, error } = await supabase.rpc("admin_top_products", {
      p_days: days,
      p_limit: limit,
    });
    if (error) throw error;
    return ((data ?? []) as TopProductRow[]).map((r) => ({
      productId: r.product_id,
      name: r.name,
      image: r.image,
      shopName: r.shop_name,
      units: Number(r.units ?? 0),
      revenueKes: Number(r.revenue_kes ?? 0),
      rating: Number(r.rating ?? 0),
      reviewCount: Number(r.review_count ?? 0),
    }));
  },

  async revenueSeries(days = 30): Promise<RevenuePoint[]> {
    const { data, error } = await supabase.rpc("admin_revenue_series", { p_days: days });
    if (error) throw error;
    return ((data ?? []) as RevenueRow[]).map((r) => ({
      day: r.day,
      grossKes: Number(r.gross_kes ?? 0),
      orders: Number(r.orders ?? 0),
    }));
  },

  async repeatCustomerRate(days = 90): Promise<RepeatCustomerRate> {
    const { data, error } = await supabase.rpc("admin_repeat_customer_rate", { p_days: days });
    if (error) throw error;
    return data as RepeatCustomerRate;
  },

  /* --- Platform settings ------------------------------------------------- */

  async getSocialLinks(): Promise<SocialLinks> {
    // A plain table read, not an RPC: platform_settings has a public SELECT
    // policy because these are the links printed in the footer.
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "social_links")
      .maybeSingle();
    if (error) throw error;
    return { ...EMPTY_SOCIALS, ...((data?.value ?? {}) as Partial<SocialLinks>) };
  },

  async setSocialLinks(links: SocialLinks): Promise<void> {
    const { error } = await supabase.rpc("admin_set_setting", {
      p_key: "social_links",
      p_value: links,
    });
    if (error) throw error;
  },
};
