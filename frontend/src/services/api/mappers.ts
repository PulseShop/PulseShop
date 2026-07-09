import type { Merchant, Product, StockStatus } from "@/types";
import type { ProductInput } from "../types";

/** A row from the `products` table (snake_case). */
export interface ProductRow {
  id: string;
  merchant_id: string;
  name: string;
  sku: string;
  category: string;
  price_kes: number;
  discount_pct: number | null;
  stock_qty: number;
  status: StockStatus;
  images: string[] | null;
  sizes: string[] | null;
  rating: number | string;
  review_count: number;
  description: string | null;
  created_at: string;
}

/** A row from the `merchants` table (snake_case). */
export interface MerchantRow {
  id: string;
  name: string;
  handle: string;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  is_online: boolean;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  rating: number | string;
}

/** Fallback avatar so an empty profile still renders a face on the storefront. */
const avatarFor = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d9488&color=fff&size=160`;

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    priceKes: row.price_kes,
    discountPct: row.discount_pct,
    stockQty: row.stock_qty,
    status: row.status,
    images: row.images ?? [],
    sizes: row.sizes,
    rating: Number(row.rating),
    reviewCount: row.review_count,
    description: row.description ?? "",
    createdAt: row.created_at,
  };
}

export function toMerchant(
  row: MerchantRow,
  stats: { products: number; orders: number },
): Merchant {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    bio: row.bio ?? "",
    location: row.location ?? "",
    avatarUrl: row.avatar_url || avatarFor(row.name),
    isOnline: row.is_online,
    stats: { products: stats.products, orders: stats.orders, rating: Number(row.rating) },
    contacts: {
      whatsapp: row.whatsapp ?? "",
      instagram: row.instagram ?? "",
      facebook: row.facebook ?? "",
    },
  };
}

/** ProductInput (camelCase) -> writable columns on the `products` table. */
export function productInputToRow(patch: Partial<ProductInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.sku !== undefined) row.sku = patch.sku;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.priceKes !== undefined) row.price_kes = patch.priceKes;
  if (patch.discountPct !== undefined) row.discount_pct = patch.discountPct;
  if (patch.stockQty !== undefined) row.stock_qty = patch.stockQty;
  if (patch.images !== undefined) row.images = patch.images;
  if (patch.sizes !== undefined) row.sizes = patch.sizes;
  if (patch.description !== undefined) row.description = patch.description;
  return row;
}
