import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/Skeleton";
import { services } from "@/services";

/**
 * A short strip of product suggestions, reused by the empty-cart upsell and the
 * checkout "you may also like" rail. No new backend: it leans on the existing
 * paginated RPCs — `searchProducts` with no term returns the platform's newest
 * products (the freshest sellers), and a `shopId` scopes it to one shop, which
 * is what checkout wants since the cart is single-shop anyway.
 *
 * `exclude` drops ids already in the cart so we never suggest what's in it.
 * Renders nothing (not an empty heading) when there's nothing to show.
 */
export function RecommendedProducts({
  title,
  shopId,
  exclude = [],
  limit = 6,
  layout = "grid",
}: {
  title: string;
  /** Scope to one shop; omit for platform-wide newest products. */
  shopId?: string;
  exclude?: string[];
  limit?: number;
  /** "grid" wraps (empty cart); "rail" scrolls horizontally (checkout side). */
  layout?: "grid" | "rail";
}) {
  const q = useQuery({
    // Over-fetch by the exclude count so the strip still fills after removals.
    queryKey: ["recommended", shopId ?? "all", limit + exclude.length],
    queryFn: () =>
      shopId
        ? services.products.listShopProducts(shopId, { pageSize: limit + exclude.length })
        : services.products.searchProducts({ pageSize: limit + exclude.length, sort: "newest" }),
    staleTime: 5 * 60 * 1000,
  });

  const excludeSet = new Set(exclude);
  const products = (q.data?.items ?? []).filter((p) => !excludeSet.has(p.id)).slice(0, limit);

  if (q.isLoading) {
    return (
      <section>
        <h2 className="mb-3 text-sm font-bold text-ink">{title}</h2>
        <div
          className={
            layout === "rail"
              ? "no-scrollbar flex gap-3 overflow-x-auto pb-1"
              : "grid grid-cols-2 gap-3 sm:grid-cols-3"
          }
        >
          {Array.from({ length: layout === "rail" ? 3 : 4 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold text-ink">{title}</h2>
      <div
        className={
          layout === "rail"
            ? "no-scrollbar flex gap-3 overflow-x-auto pb-1"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3"
        }
      >
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            className={layout === "rail" ? "w-36 shrink-0" : undefined}
          />
        ))}
      </div>
    </section>
  );
}
