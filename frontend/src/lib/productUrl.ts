import type { Product } from "@/types";

/**
 * Where a product lives.
 *
 * The canonical form is `/{shopHandle}/{productSlug}` — keyword-bearing, and
 * nested under the shop so a crawler reads a storefront as one store rather
 * than as a scatter of unrelated pages.
 *
 * Falls back to the legacy `/product/{id}` when either segment is missing. That
 * happens for a Product read through a projection that omitted the slug, and
 * for anything still holding an old link; the route still resolves and
 * api/render.ts 301s it to the canonical URL, so the fallback costs a redirect,
 * never a broken link.
 */
export function productHref(
  product: Pick<Product, "id" | "slug"> & { shopSlug?: string },
): string {
  return product.shopSlug && product.slug
    ? `/${product.shopSlug}/${product.slug}`
    : `/product/${product.id}`;
}

/** The same path as an absolute URL, for sharing and canonical tags. */
export const productUrl = (
  product: Pick<Product, "id" | "slug"> & { shopSlug?: string },
  origin: string = typeof window === "undefined" ? "" : window.location.origin,
) => origin + productHref(product);
