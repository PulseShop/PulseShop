import type { Merchant, Product } from "@/types";
import type { ProductInput, ProductService } from "../types";
import { requireUserId, supabase } from "./client";
import {
  type MerchantRow,
  type ProductRow,
  productInputToRow,
  toMerchant,
  toProduct,
} from "./mappers";

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

    const [{ count: products }, { count: orders }] = await Promise.all([
      supabase.from("products").select("*", { count: "exact", head: true }).eq("merchant_id", uid),
      supabase.from("orders").select("*", { count: "exact", head: true }).eq("merchant_id", uid),
    ]);

    return toMerchant(merchant, { products: products ?? 0, orders: orders ?? 0 });
  },

  async listProducts(): Promise<Product[]> {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("merchant_id", uid)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as ProductRow[]).map(toProduct);
  },

  async getProduct(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle<ProductRow>();
    if (error) throw error;
    return data ? toProduct(data) : null;
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
};
