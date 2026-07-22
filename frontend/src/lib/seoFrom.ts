import type { Merchant, Product } from "@/types";
import { maxVariantPrice, minVariantPrice } from "./currency";
import { type SeoProduct, type SeoShop } from "./seo";

/**
 * Adapters from the app's own models to the shapes lib/seo.ts works in.
 *
 * lib/seo.ts is deliberately free of imports — it is copied verbatim into the
 * serverless function bundle, where `@/types` does not resolve — so the mapping
 * lives here instead, on the browser side only. The server gets the same fields
 * straight from the seo_shop()/seo_product() RPCs.
 *
 * The prices go through the same minVariantPrice/maxVariantPrice the grid uses,
 * which mirror effective_price() in SQL to the shilling. That is what keeps the
 * figure in a shared link's preview equal to the figure at checkout.
 */

/**
 * `categories` is a separate argument because it does not live on Merchant —
 * the storefront reads it from shop_facets(), while the server reads it inside
 * seo_shop(). Passing it matters: with no tagline and no meta description the
 * generated description names the shop's categories, so omitting them here
 * produces a DIFFERENT description from the one the server rendered for the
 * same page. Same page, two descriptions, is the divergence this whole module
 * exists to prevent.
 */
export const seoShopFrom = (shop: Merchant, categories: string[] = []): SeoShop => ({
  name: shop.name,
  handle: shop.handle,
  tagline: shop.tagline,
  bio: shop.bio,
  location: shop.location,
  metaDescription: shop.metaDescription,
  avatarUrl: shop.avatarUrl,
  bannerUrl: shop.bannerUrl,
  productCount: shop.stats.products,
  // seo_shop() returns these sorted; sort here too so the two agree exactly.
  categories: [...categories].sort(),
});

export const seoProductFrom = (product: Product, shop: Merchant | undefined): SeoProduct => ({
  name: product.name,
  slug: product.slug,
  sku: product.sku,
  category: product.category,
  summary: product.summary ?? "",
  description: product.description,
  metaDescription: product.metaDescription ?? "",
  images: product.images,
  minPrice: minVariantPrice(product),
  maxPrice: maxVariantPrice(product),
  inStock: product.status !== "out",
  shopName: shop?.name ?? "",
  shopHandle: product.shopSlug ?? shop?.handle ?? "",
  shopLocation: shop?.location ?? "",
});
