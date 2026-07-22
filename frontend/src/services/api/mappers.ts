import type { Merchant, Product, StockStatus } from "@/types";
import { toSocialHandle, toWhatsAppDigits } from "@/lib/phone";
import type { MerchantUpdate, ProductInput } from "../types";

/**
 * A row from the `products` table (snake_case). `merchant_id` and
 * `description` are optional here — the public storefront grid query
 * (listShopProducts) omits both (unused by ProductCard, and description can
 * be the largest field on the row); toProduct() already falls back safely
 * when they're absent.
 */
export interface ProductRow {
  id: string;
  merchant_id?: string;
  name: string;
  slug?: string;
  sku: string;
  category: string;
  price_kes: number;
  discount_pct: number | null;
  stock_qty: number;
  status: StockStatus;
  images: string[] | null;
  sizes: string[] | null;
  colors: string[] | null;
  size_price_adj?: Record<string, number> | null;
  color_price_adj?: Record<string, number> | null;
  rating: number | string;
  review_count: number;
  summary?: string | null;
  description?: string | null;
  meta_description?: string | null;
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
  banner_url: string | null;
  is_online: boolean;
  tagline?: string | null;
  meta_description?: string | null;
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
    // NOT NULL in the database since 0028; the fallback only covers a row read
    // through a projection that omitted it, where an empty slug correctly makes
    // canonicalProductPath() fall back to the legacy /product/:id URL rather
    // than building `/shop//`.
    slug: row.slug ?? "",
    sku: row.sku,
    category: row.category,
    priceKes: row.price_kes,
    discountPct: row.discount_pct,
    stockQty: row.stock_qty,
    status: row.status,
    images: row.images ?? [],
    sizes: row.sizes,
    colors: row.colors,
    sizePriceAdj: row.size_price_adj ?? {},
    colorPriceAdj: row.color_price_adj ?? {},
    rating: Number(row.rating),
    reviewCount: row.review_count,
    summary: row.summary ?? null,
    description: row.description ?? "",
    metaDescription: row.meta_description ?? null,
    createdAt: row.created_at,
  };
}

export function toMerchant(
  row: MerchantRow,
  stats: { products: number; orders: number; followers: number; rating: number },
): Merchant {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    bio: row.bio ?? "",
    location: row.location ?? "",
    avatarUrl: row.avatar_url || avatarFor(row.name),
    bannerUrl: row.banner_url ?? "",
    isOnline: row.is_online,
    tagline: row.tagline ?? "",
    metaDescription: row.meta_description ?? "",
    stats: {
      products: stats.products,
      orders: stats.orders,
      followers: stats.followers,
      rating: stats.rating,
    },
    contacts: {
      whatsapp: row.whatsapp ? toWhatsAppDigits(row.whatsapp) : "",
      instagram: row.instagram ? toSocialHandle(row.instagram) : "",
      facebook: row.facebook ? toSocialHandle(row.facebook) : "",
    },
  };
}

/** ProductInput (camelCase) -> writable columns on the `products` table. */
export function productInputToRow(patch: Partial<ProductInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  // Only ever present when the seller deliberately edited it — the trigger in
  // 0028 fills it in on create and leaves it alone on rename.
  if (patch.slug !== undefined) row.slug = patch.slug;
  if (patch.metaDescription !== undefined) row.meta_description = patch.metaDescription || null;
  if (patch.sku !== undefined) row.sku = patch.sku;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.priceKes !== undefined) row.price_kes = patch.priceKes;
  if (patch.discountPct !== undefined) row.discount_pct = patch.discountPct;
  if (patch.stockQty !== undefined) row.stock_qty = patch.stockQty;
  if (patch.images !== undefined) row.images = patch.images;
  if (patch.sizes !== undefined) row.sizes = patch.sizes;
  if (patch.colors !== undefined) row.colors = patch.colors;
  if (patch.sizePriceAdj !== undefined) row.size_price_adj = patch.sizePriceAdj;
  if (patch.colorPriceAdj !== undefined) row.color_price_adj = patch.colorPriceAdj;
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.description !== undefined) row.description = patch.description;
  return row;
}

/** MerchantUpdate (camelCase) -> writable columns on the `merchants` table. */
export function merchantUpdateToRow(patch: MerchantUpdate): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.handle !== undefined) row.handle = patch.handle;
  if (patch.bio !== undefined) row.bio = patch.bio;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
  if (patch.bannerUrl !== undefined) row.banner_url = patch.bannerUrl;
  if (patch.isOnline !== undefined) row.is_online = patch.isOnline;
  if (patch.whatsapp !== undefined) row.whatsapp = patch.whatsapp ? toWhatsAppDigits(patch.whatsapp) : "";
  if (patch.instagram !== undefined) row.instagram = patch.instagram ? toSocialHandle(patch.instagram) : "";
  if (patch.facebook !== undefined) row.facebook = patch.facebook ? toSocialHandle(patch.facebook) : "";
  // Empty string and "unset" mean the same thing for these two — a blank
  // tagline should make the title fall back to the generated one, not render
  // "Shop — | PulseShop".
  if (patch.tagline !== undefined) row.tagline = patch.tagline.trim() || null;
  if (patch.metaDescription !== undefined) row.meta_description = patch.metaDescription.trim() || null;
  return row;
}
