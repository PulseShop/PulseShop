import { useQuery } from "@tanstack/react-query";
import { Package, ShoppingCart, Store, Users } from "lucide-react";
import { Link } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { FollowButton } from "@/components/shop/FollowButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { services } from "@/services";

/**
 * Instagram-style shop discovery: every shop on the platform in a simple list,
 * with a Follow/Following button per row. Anyone can browse; following needs
 * a signed-in account.
 */
export function ShopsPage() {
  const shopsQ = useQuery({ queryKey: ["shops"], queryFn: services.follows.listShops });

  return (
    <MobileShell>
      <header className="glass-header sticky top-0 z-30 px-4 py-4">
        <h1 className="text-lg font-extrabold text-ink">Shops</h1>
        <p className="text-xs font-medium text-muted">Follow sellers to keep up with their stores</p>
      </header>

      <div className="space-y-3 px-4 pb-6 pt-2">
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
          <div className="rounded-card bg-card p-8 text-center shadow-soft">
            <p className="font-semibold text-ink">Couldn't load shops</p>
            <button
              type="button"
              onClick={() => shopsQ.refetch()}
              className="mt-3 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </div>
        ) : (shopsQ.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card bg-card p-8 text-center shadow-soft">
            <div className="flex size-14 items-center justify-center rounded-full bg-stone-100">
              <Store className="size-7 text-muted" />
            </div>
            <p className="font-semibold text-ink">No shops yet</p>
            <p className="text-sm text-muted">Be the first — create your shop on PulseShop.</p>
          </div>
        ) : (
          (shopsQ.data ?? []).map((shop) => (
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
          ))
        )}
      </div>
    </MobileShell>
  );
}
