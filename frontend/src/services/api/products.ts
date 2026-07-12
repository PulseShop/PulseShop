import type { Merchant, Paged, Product, ShopFacets } from "@/types";
import type { ProductInput, ProductQuery, ProductService } from "../types";
import { requireUserId, supabase } from "./client";
import type { MerchantUpdate } from "../types";
import {
  type MerchantRow,
  type ProductRow,
  merchantUpdateToRow,
  productInputToRow,
  toMerchant,
  toProduct,
} from "./mappers";

/**
 * Product, order, follower and rating stats for a merchant.
 *
 * One RPC, not four queries. These can't be plain counts from the client: RLS
 * on `orders` only exposes rows to the owning merchant and RLS on `follows`
 * only exposes rows to the *follower*, so counting either directly reads 0 for
 * anyone browsing a storefront. merchant_stats() (0019) is security definer for
 * exactly that reason and returns all four numbers in a single round trip.
 */
export async function merchantStats(
  uid: string,
): Promise<{ products: number; orders: number; followers: number; rating: number }> {
  const { data, error } = await supabase.rpc("merchant_stats", { p_merchant_id: uid });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as
    | { product_count: number; order_count: number; follower_count: number; avg_rating: number }
    | undefined;

  return {
    products: Number(row?.product_count ?? 0),
    orders: Number(row?.order_count ?? 0),
    followers: Number(row?.follower_count ?? 0),
    rating: Number(row?.avg_rating ?? 0),
  };
}

/** A row from search_products() — a product row plus its shop handle and the
 * size of the full (filtered) result set. */
type SearchRow = ProductRow & { shop_handle: string | null; total_count: number };

function toPagedProducts(rows: SearchRow[]): Paged<Product> {
  return {
    items: rows.map((row) => {
      const product = toProduct(row);
      product.shopSlug = row.shop_handle ?? undefined;
      return product;
    }),
    // total_count is repeated on every row; absent when the page is empty.
    total: Number(rows[0]?.total_count ?? 0),
  };
}

const DEFAULT_PAGE_SIZE = 12;

/** ProductQuery -> search_products() arguments. Bound parameters, never a
 * filter string — see the note on ProductQuery in services/types.ts. */
function searchArgs(merchantId: string, q: ProductQuery = {}) {
  const pageSize = q.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, q.page ?? 1);
  return {
    p_merchant_id: merchantId,
    p_search: q.search?.trim() ?? "",
    p_category: q.category && q.category !== "All" ? q.category : null,
    p_status: q.status && q.status !== "all" ? q.status : null,
    p_max_price: q.maxPrice ?? null,
    p_sort: q.sort ?? "newest",
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  };
}

/**
 * Product + merchant reads/writes. Writes are scoped to the signed-in merchant
 * by RLS server-side; the explicit merchant_id filters here keep the dashboard
 * showing only the owner's catalogue.
 */
export const productsApi: ProductService = {
  async getMerchant(): Promise<Merchant> {
    const uid = await requireUserId();

    const { data: merchant, error } = await supabase
      .from("merchants")
      .select("*")
      .eq("id", uid)
      .single<MerchantRow>();
    if (error) throw error;

    return toMerchant(merchant, await merchantStats(uid));
  },

  async updateMerchant(patch: MerchantUpdate): Promise<Merchant> {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("merchants")
      .update(merchantUpdateToRow(patch))
      .eq("id", uid)
      .select("*")
      .single<MerchantRow>();
    if (error) throw error;
    return toMerchant(data, await merchantStats(uid));
  },

  async listProducts(query?: ProductQuery): Promise<Paged<Product>> {
    const uid = await requireUserId();
    const { data, error } = await supabase.rpc("search_products", searchArgs(uid, query));
    if (error) throw error;
    return toPagedProducts((data ?? []) as SearchRow[]);
  },

  async getProduct(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from("products")
      .select("*, merchants(handle)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const product = toProduct(data as ProductRow);
    product.shopSlug = (data as { merchants?: { handle?: string } }).merchants?.handle;
    return product;
  },

  async createProduct(input: ProductInput): Promise<Product> {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("products")
      .insert({ ...productInputToRow(input), merchant_id: uid })
      .select("*")
      .single<ProductRow>();
    if (error) throw error;
    return toProduct(data);
  },

  async updateProduct(id: string, patch: Partial<ProductInput>): Promise<Product> {
    const { data, error } = await supabase
      .from("products")
      .update(productInputToRow(patch))
      .eq("id", id)
      .select("*")
      .single<ProductRow>();
    if (error) throw error;
    return toProduct(data);
  },

  async deleteProduct(id: string): Promise<void> {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
  },

  async getShop(slug: string): Promise<Merchant | null> {
    const { data, error } = await supabase
      .from("merchants")
      .select("*")
      .eq("handle", slug)
      .maybeSingle<MerchantRow>();
    if (error) throw error;
    if (!data) return null;
    return toMerchant(data, await merchantStats(data.id));
  },

  async listShopProducts(merchantId: string, query?: ProductQuery): Promise<Paged<Product>> {
    const { data, error } = await supabase.rpc("search_products", searchArgs(merchantId, query));
    if (error) throw error;
    return toPagedProducts((data ?? []) as SearchRow[]);
  },

  async getFacets(merchantId?: string): Promise<ShopFacets> {
    const uid = merchantId ?? (await requireUserId());
    const { data, error } = await supabase.rpc("shop_facets", { p_merchant_id: uid });
    if (error) throw error;
    const f = (data ?? {}) as Partial<ShopFacets>;
    return {
      categories: f.categories ?? [],
      priceCeiling: Number(f.priceCeiling ?? 0),
      total: Number(f.total ?? 0),
      available: Number(f.available ?? 0),
      low: Number(f.low ?? 0),
      out: Number(f.out ?? 0),
    };
  },
};
