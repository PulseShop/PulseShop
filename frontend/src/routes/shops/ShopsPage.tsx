import { useInfiniteQuery } from "@tanstack/react-query";
import { Package, ShoppingCart, Store, Users } from "lucide-react";
import { Link } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { DesktopQuickNav } from "@/components/layout/DesktopQuickNav";
import { Logo } from "@/components/common/Logo";
import { FollowButton } from "@/components/shop/FollowButton";
import { ProductImage } from "@/components/product/ProductImage";
import { Skeleton } from "@/components/ui/Skeleton";
import { services } from "@/services";

const PAGE_SIZE = 20;

/**
 * Instagram-style shop discovery, with a Follow/Following button per row.
 * Anyone can browse; following needs a signed-in account.
 *
 * One request per page of shops, flat in the number of shops on the platform.
 * This page used to cost 5N+1 requests: listShops() fetched every merchant row
 * with no limit and then fired four stat queries per shop, and the page fired a
 * *further* query per shop that pulled that shop's entire catalogue just to
 * show three thumbnails. shop_directory() (0019) returns the stats and the
 * previews inline, so both fan-outs are gone.
 */
export function ShopsPage() {
  const shopsQ = useInfiniteQuery({
    queryKey: ["shops"],
    queryFn: ({ pageParam }) => services.follows.listShops({ page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? all.length + 1 : undefined;
    },
  });

  const shops = shopsQ.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <MobileShell wide>
      <header className="glass-header sticky top-0 z-30 flex flex-col items-center px-4 py-5 text-center lg:flex-row lg:items-center lg:justify-between lg:px-6 lg:py-4 lg:text-left">
        <div className="flex flex-col items-center lg:flex-row lg:items-center lg:gap-3">
          <Logo size={44} className="mb-2 lg:mb-0" />
          <div>
            <h1 className="text-lg font-extrabold text-ink lg:text-xl">Shops</h1>
            <p className="text-xs font-medium text-muted lg:text-sm">
              Follow sellers to keep up with their stores
            </p>
          </div>
        </div>
        <DesktopQuickNav />
      </header>

      <div className="space-y-3 px-4 pb-6 pt-2 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:px-6 lg:pt-4 xl:grid-cols-3">
        {shopsQ.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-card bg-card p-3 shadow-soft">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
              <Skeleton className="h-9 w-20 rounded-full" />
            </div>
          ))
        ) : shopsQ.isError ? (
          <div className="rounded-card bg-card p-8 text-center shadow-soft lg:col-span-full">
            <p className="font-semibold text-ink">Couldn't load shops</p>
            <button
              type="button"
              onClick={() => shopsQ.refetch()}
              className="mt-3 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </div>
        ) : shops.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card bg-card p-8 text-center shadow-soft lg:col-span-full">
            <div className="flex size-14 items-center justify-center rounded-full bg-stone-100">
              <Store className="size-7 text-muted" />
            </div>
            <p className="font-semibold text-ink">No shops yet</p>
            <p className="text-sm text-muted">Be the first — create your shop on PulseShop.</p>
          </div>
        ) : (
          shops.map((shop) => {
            const preview = shop.previews ?? [];
            return (
            <div key={shop.id} className="rounded-card bg-card p-3 shadow-soft">
              <div className="flex items-center gap-3">
                {/* profile — tap to open the shop */}
                <Link to={`/${shop.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                  {shop.avatarUrl ? (
                    <img
                      src={shop.avatarUrl}
                      alt={shop.name}
                      className="size-12 shrink-0 rounded-full object-cover ring-2 ring-stone-100"
                    />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Store className="size-5 text-primary" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{shop.name}</p>
                    <p className="truncate text-xs text-muted">
                      @{shop.handle}
                      {shop.location ? ` · ${shop.location}` : ""}
                    </p>
                  </div>
                </Link>

                <FollowButton merchantId={shop.id} className="shrink-0" />
              </div>

              {shop.bio && (
                <p className="mt-2.5 line-clamp-2 text-xs text-muted">{shop.bio}</p>
              )}

              {preview.length > 0 && (
                <div className="mt-2.5 flex gap-2">
                  {preview.map((p) => (
                    <Link key={p.id} to={`/product/${p.id}`} className="shrink-0">
                      <ProductImage
                        src={p.image}
                        alt={p.name}
                        className="size-14 rounded-lg object-cover"
                      />
                    </Link>
                  ))}
                </div>
              )}

              <div className="mt-2.5 flex items-center gap-4 border-t border-stone-100 pt-2.5 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <Package className="size-3.5" />
                  {shop.stats.products} product{shop.stats.products === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1">
                  <ShoppingCart className="size-3.5" />
                  {shop.stats.orders} order{shop.stats.orders === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" />
                  {shop.stats.followers} follower{shop.stats.followers === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            );
          })
        )}

        {shopsQ.hasNextPage && (
          <div className="pt-2 lg:col-span-full lg:flex lg:justify-center">
            <button
              type="button"
              onClick={() => shopsQ.fetchNextPage()}
              disabled={shopsQ.isFetchingNextPage}
              className="w-full rounded-btn border border-stone-200 bg-card px-4 py-3 text-sm font-bold text-ink shadow-soft disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:w-auto lg:px-8"
            >
              {shopsQ.isFetchingNextPage ? "Loading…" : "Load more shops"}
            </button>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
