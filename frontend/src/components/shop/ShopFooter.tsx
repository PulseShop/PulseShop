import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Store } from "lucide-react";
import { Link } from "react-router";
import { ProductImage } from "@/components/product/ProductImage";
import { services } from "@/services";

/**
 * Footer for a single-shop page (a storefront the shopper has "selected"). Once
 * you tap into one shop there's no obvious route back to the full directory, so
 * this surfaces a handful of OTHER shops plus a link to the whole list — the
 * navigation escape hatch the user asked for.
 *
 * `excludeId` is the shop currently being viewed, so it never lists itself.
 */
export function ShopFooter({ excludeId }: { excludeId?: string }) {
  const shopsQ = useQuery({
    queryKey: ["shop-footer"],
    // A small page is plenty — this is a teaser, "See all" carries the rest.
    queryFn: () => services.follows.listShops({ page: 1, pageSize: 10 }),
    staleTime: 5 * 60 * 1000,
  });

  const others = (shopsQ.data?.items ?? []).filter((s) => s.id !== excludeId).slice(0, 8);

  // Nothing to show (the only shop, or the fetch failed) — don't render an
  // empty band. The bottom nav / floating back are still the primary way out.
  if (others.length === 0) return null;

  return (
    <footer className="mt-10 border-t border-stone-100 bg-card/40 px-4 py-8 lg:px-6">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <Store className="size-4 text-primary" />
            Explore other shops
          </h2>
          <Link
            to="/shops"
            className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            See all
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible xl:grid-cols-8">
          {others.map((shop) => (
            <Link
              key={shop.id}
              to={`/${shop.handle}`}
              className="flex w-20 shrink-0 flex-col items-center gap-2 rounded-card p-2 text-center transition-colors hover:bg-stone-100 lg:w-auto"
            >
              {shop.avatarUrl ? (
                <ProductImage
                  src={shop.avatarUrl}
                  alt={shop.name}
                  className="size-14 rounded-full object-cover ring-2 ring-stone-100"
                />
              ) : (
                <span className="flex size-14 items-center justify-center rounded-full bg-primary/10">
                  <Store className="size-6 text-primary" />
                </span>
              )}
              <span className="w-full truncate text-xs font-semibold text-ink">{shop.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
