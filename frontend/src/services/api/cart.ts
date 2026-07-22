import type { CartItem } from "@/types";
import type { CartService } from "../types";
import { discountedPrice } from "@/lib/currency";
import { productImageSrc } from "@/lib/productImage";
import { requireUserId, supabase } from "./client";

/** One row from cart_items joined to its product + shop. products/merchants
 * are public-read tables, so the embed resolves under the caller's own RLS —
 * same as listProducts' `merchants(handle)` join in products.ts. */
interface CartRow {
  product_id: string;
  size: string;
  qty: number;
  products: {
    name: string;
    images: string[] | null;
    price_kes: number;
    discount_pct: number | null;
    stock_qty: number;
    merchants: { handle: string } | null;
  } | null;
}

/** Live product data wins over whatever was true when the row was written —
 * a cart should show today's price and stock, not a stale snapshot. Returns
 * null when the product has since been deleted (FK is ON DELETE CASCADE, so
 * this only happens on a stale read racing a delete). */
function hydrate(row: CartRow): CartItem | null {
  const p = row.products;
  if (!p) return null;
  return {
    productId: row.product_id,
    shopSlug: p.merchants?.handle ?? "",
    name: p.name,
    image: productImageSrc(p.images),
    unitPrice: discountedPrice(p.price_kes, p.discount_pct),
    size: row.size || null,
    qty: row.qty,
    stockQty: p.stock_qty,
  };
}

/**
 * Server sync for a signed-in shopper's cart (migration 0025's `cart_items`
 * table, RLS owner-only). Mirrors favorites.ts — see stores/cart.ts and
 * hooks/useCart.ts for how this layers under the local device cache.
 */
export const cartApi: CartService = {
  async listCart(): Promise<CartItem[]> {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from("cart_items")
      .select(
        "product_id, size, qty, products(name, images, price_kes, discount_pct, stock_qty, merchants(handle))",
      )
      .eq("user_id", uid);
    if (error) throw error;
    return (data as unknown as CartRow[]).map(hydrate).filter((i): i is CartItem => i !== null);
  },

  async upsertCartItem(item: CartItem): Promise<void> {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("cart_items")
      .upsert({ user_id: uid, product_id: item.productId, size: item.size ?? "", qty: item.qty });
    if (error) throw error;
  },

  async removeCartItem(productId: string, size: string | null): Promise<void> {
    const uid = await requireUserId();
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", uid)
      .eq("product_id", productId)
      .eq("size", size ?? "");
    if (error) throw error;
  },

  async clearCart(): Promise<void> {
    const uid = await requireUserId();
    const { error } = await supabase.from("cart_items").delete().eq("user_id", uid);
    if (error) throw error;
  },
};
