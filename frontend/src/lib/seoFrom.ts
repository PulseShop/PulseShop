import type { Merchant, Product } from "@/types";
import { maxVariantPrice, minVariantPrice } from "./currency";
import { type SeoCategory, type SeoProduct, type SeoShop } from "./seo";

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
export const seoShopFrom = (
  shop: Merchant,
  categories: string[] = [],
  /**
   * The storefront's own products, for the ItemList shopSeo() emits (migration
   * 0055). Same argument as `categories`: the server builds this list from
   * seo_shop(), so leaving it out here would have hydration strip the ItemList
   * off a page that was served with one.
   *
   * The server caps at 24 and sorts newest-first; shopSeo() re-caps, and the
   * caller passes the grid in the order it is displaying it, which is that same
   * default sort.
   */
  products: Product[] = [],
): SeoShop => ({
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
  products: products.slice(0, 24).map((p) => ({
    name: p.name,
    slug: p.slug,
    price: minVariantPrice(p),
    image: p.images[0] ?? "",
    imageAlt: p.imageAlts?.[0] ?? "",
    inStock: p.status !== "out",
  })),
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
  imageAlts: product.imageAlts ?? [],
  minPrice: minVariantPrice(product),
  maxPrice: maxVariantPrice(product),
  inStock: product.status !== "out",
  /**
   * These three feed aggregateRating and itemCondition (migration 0055), and
   * they are here for the same reason `categories` is an argument to
   * seoShopFrom: the server emits them from seo_product(), so a client that
   * omitted them would replace the server's JSON-LD with a version missing the
   * star rating the moment React hydrated. Same page, two answers, which is
   * what this module exists to prevent.
   */
  rating: product.rating,
  reviewCount: product.reviewCount,
  condition: product.phoneSpecs?.condition ?? "",
  shopName: shop?.name ?? "",
  shopHandle: product.shopSlug ?? shop?.handle ?? "",
  shopLocation: shop?.location ?? "",
});

/**
 * A category page's SEO input, assembled from the product page the browser
 * already loaded rather than a second round trip to seo_category().
 *
 * `productCount` is the query's total, not the loaded page's length — the
 * description states how many listings a category has, and paging must not
 * change the answer. `shopCount` genuinely can only be counted over what has
 * loaded, so the first page's worth is the honest floor; it is used for a
 * "from N shops" phrase, not for anything that has to be exact.
 */
export const seoCategoryFrom = (
  name: string,
  slug: string,
  products: Product[],
  total: number,
): SeoCategory => {
  const shops = new Map<string, { name: string; handle: string; location: string; count: number }>();
  for (const p of products) {
    const handle = p.shopSlug ?? "";
    if (!handle) continue;
    const seen = shops.get(handle);
    if (seen) seen.count += 1;
    else shops.set(handle, { name: p.shopName ?? handle, handle, location: "", count: 1 });
  }

  return {
    name,
    slug,
    productCount: total,
    shopCount: shops.size,
    shops: [...shops.values()].sort((a, b) => a.name.localeCompare(b.name)),
    products: products.slice(0, 24).map((p) => ({
      name: p.name,
      slug: p.slug,
      price: minVariantPrice(p),
      image: p.images[0] ?? "",
      imageAlt: p.imageAlts?.[0] ?? "",
      inStock: p.status !== "out",
      shopName: p.shopName ?? "",
      shopHandle: p.shopSlug ?? "",
    })),
  };
};
