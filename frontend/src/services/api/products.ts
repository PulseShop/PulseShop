import type { Merchant, Product } from "@/types";
import type { ProductInput, ProductService } from "../types";
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

/** Product + order counts for a merchant, used to populate Merchant.stats. */
async function merchantStats(uid: string): Promise<{ products: number; orders: number }> {
  const [{ count: products }, { count: orders }] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }).eq("merchant_id", uid),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("merchant_id", uid),
  ]);
  return { products: products ?? 0, orders: orders ?? 0 };
}

/**
 * Product + merchant reads/writes scoped to the signed-in merchant. RLS also
 * enforces this server-side; the explicit merchant_id filters keep the
 * dashboard showing only the owner's catalogue.
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

  async listProducts(): Promise<Product[]> {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("products")
      .select("*, merchants(handle)")
      .eq("merchant_id", uid)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as (ProductRow & { merchants?: { handle?: string } })[]).map((row) => {
      const product = toProduct(row);
      product.shopSlug = row.merchants?.handle;
      return product;
    });
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

  async listShopProducts(merchantId: string): Promise<Product[]> {
    const { data, error } = await supabase
      .from("products")
      .select("*, merchants(handle)")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as (ProductRow & { merchants?: { handle?: string } })[]).map((row) => {
      const product = toProduct(row);
      product.shopSlug = row.merchants?.handle;
      return product;
    });
  },
};
