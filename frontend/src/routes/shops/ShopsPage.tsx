import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Package, Search, ShoppingCart, Store, Users, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Merchant } from "@/types";
import { MobileShell } from "@/components/layout/MobileShell";
import { DesktopQuickNav } from "@/components/layout/DesktopQuickNav";
import { Logo } from "@/components/common/Logo";
import { FollowButton } from "@/components/shop/FollowButton";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductImage } from "@/components/product/ProductImage";
import { QueryError } from "@/components/common/QueryError";
import { ProductCardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import { cn } from "@/lib/utils";
import { services } from "@/services";

const PAGE_SIZE = 20;
const PRODUCT_PAGE_SIZE = 12;

/**
 * Instagram-style shop discovery, with a Follow/Following button per row and a
 * universal search that spans the whole platform — shops AND products, not just
 * the shops on this page.
 *
 * Both halves of the search are server-side (shop_directory / search_products,
 * migration 0023). They have to be: these lists are paged, and a filter applied
 * in the browser would only ever search the page already loaded, so a shop or a
 * product on page 3 would be invisible to a search that should have found it.
 *
 * One request per page of shops, flat in the number of shops on the platform.
 * This page used to cost 5N+1 requests: listShops() fetched every merchant row
 * with no limit and then fired four stat queries per shop, and the page fired a
 * *further* query per shop that pulled that shop's entire catalogue just to
 * show three thumbnails. shop_directory() (0019) returns the stats and the
 * previews inline, so both fan-outs are gone.
 */
export function ShopsPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  // One full-platform query per keystroke would be a lot of table scans.
  const term = useDebounced(search.trim());
  const searching = term.length > 0;

  const shopsQ = useInfiniteQuery({
    queryKey: ["shops", term],
    queryFn: ({ pageParam }) =>
      services.follows.listShops({ page: pageParam, pageSize: PAGE_SIZE, search: term }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? all.length + 1 : undefined;
    },
    placeholderData: keepPreviousData,
  });

  const productsQ = useInfiniteQuery({
    queryKey: ["search-products", term],
    queryFn: ({ pageParam }) =>
      services.products.searchProducts({
        search: term,
        pageSize: PRODUCT_PAGE_SIZE,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? all.length + 1 : undefined;
    },
    // Without a term this would return every product on the platform, which is
    // not what the shops page is for.
    enabled: searching,
    placeholderData: keepPreviousData,
  });

  const shops = shopsQ.data?.pages.flatMap((p) => p.items) ?? [];
  const shopTotal = shopsQ.data?.pages[0]?.total ?? 0;
  const products = productsQ.data?.pages.flatMap((p) => p.items) ?? [];
  const productTotal = productsQ.data?.pages[0]?.total ?? 0;

  const loading = shopsQ.isLoading || (searching && productsQ.isLoading);
  const failed = shopsQ.isError || (searching && productsQ.isError);
  // "No matches" is a claim about the data. A failed query hasn't earned it —
  // that's the empty-list-on-error bug the QueryError component exists for.
  const nothingFound =
    searching && !loading && !failed && shops.length === 0 && products.length === 0;

  const closeSearch = () => {
    setSearchOpen(false);
    setSearch("");
  };

  return (
    <MobileShell wide>
      <header className="glass-header sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size={40} />
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-ink lg:text-xl">Shops</h1>
            <p className="truncate text-xs font-medium text-muted lg:text-sm">
              Find shops and products
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 lg:gap-2">
          <button
            type="button"
            aria-label={searchOpen ? "Close search" : "Search shops and products"}
            aria-expanded={searchOpen}
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            className={cn(
              "flex size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:size-10",
              searchOpen ? "bg-primary text-white" : "text-ink hover:bg-stone-100",
            )}
          >
            {searchOpen ? <X className="size-5" /> : <Search className="size-5" />}
          </button>
          <DesktopQuickNav />
        </div>
      </header>

      {searchOpen && (
        <div className="px-4 pt-3 animate-grid-fade lg:px-6">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shops and products…"
            aria-label="Search shops and products"
            className="h-11 w-full rounded-btn border border-stone-200 bg-card px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}

      <div className="px-4 pb-6 pt-2 lg:px-6 lg:pt-4">
        {nothingFound ? (
          <div className="flex flex-col items-center gap-3 rounded-card bg-card p-8 text-center shadow-soft">
            <div className="flex size-14 items-center justify-center rounded-full bg-stone-100">
              <Search className="size-7 text-muted" />
            </div>
            <p className="font-semibold text-ink">No matches for "{term}"</p>
            <p className="text-sm text-muted">Try a shop name, a handle, or a product.</p>
          </div>
        ) : (
          <>
            {/* ---- shops ---- */}
            {(shopsQ.isLoading || shopsQ.isError || shops.length > 0 || !searching) && (
              <section>
                {searching && !shopsQ.isLoading && shops.length > 0 && (
                  <SectionHeading label="Shops" count={shopTotal} />
                )}

                <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 xl:grid-cols-3">
                  {shopsQ.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => <ShopRowSkeleton key={i} />)
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
                      <p className="text-sm text-muted">
                        Be the first — create your shop on PulseShop.
                      </p>
                    </div>
                  ) : (
                    shops.map((shop) => <ShopRow key={shop.id} shop={shop} />)
                  )}
                </div>

                {shopsQ.hasNextPage && (
                  <LoadMore
                    onClick={() => shopsQ.fetchNextPage()}
                    loading={shopsQ.isFetchingNextPage}
                    label="Load more shops"
                  />
                )}
              </section>
            )}

            {/* ---- products, only while searching ---- */}
            {searching && (productsQ.isLoading || productsQ.isError || products.length > 0) && (
              <section className={cn(shops.length > 0 && "mt-6")}>
                {!productsQ.isLoading && !productsQ.isError && (
                  <SectionHeading label="Products" count={productTotal} />
                )}

                {productsQ.isError ? (
                  <QueryError
                    title="Couldn't search products"
                    onRetry={() => productsQ.refetch()}
                    retrying={productsQ.isFetching}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                    {productsQ.isLoading
                      ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
                      : products.map((p) => <ProductCard key={p.id} product={p} />)}
                  </div>
                )}

                {productsQ.hasNextPage && (
                  <LoadMore
                    onClick={() => productsQ.fetchNextPage()}
                    loading={productsQ.isFetchingNextPage}
                    label={`Load more (${productTotal - products.length} left)`}
                  />
                )}
              </section>
            )}
          </>
        )}
      </div>
    </MobileShell>
  );
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2 text-sm font-bold text-ink">
      {label}
      <span className="text-xs font-medium text-muted">{count}</span>
    </h2>
  );
}

function LoadMore({
  onClick,
  loading,
  label,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <div className="mt-3 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="w-full rounded-btn border border-stone-200 bg-card px-4 py-3 text-sm font-bold text-ink shadow-soft disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:w-auto lg:px-8"
      >
        {loading ? "Loading…" : label}
      </button>
    </div>
  );
}

function ShopRow({ shop }: { shop: Merchant }) {
  const previews = shop.previews ?? [];

  return (
    <div className="rounded-card bg-card p-3 shadow-soft">
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

      {shop.bio && <p className="mt-2.5 line-clamp-2 text-xs text-muted">{shop.bio}</p>}

      {previews.length > 0 && (
        <div className="mt-2.5 flex gap-2">
          {previews.map((p) => (
            <Link key={p.id} to={`/${shop.handle}/${p.slug}`} className="shrink-0">
              <ProductImage src={p.image} alt={p.name} className="size-14 rounded-lg object-cover" />
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
}

function ShopRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-card bg-card p-3 shadow-soft">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="h-3 w-24 rounded" />
      </div>
      <Skeleton className="h-9 w-20 rounded-full" />
    </div>
  );
}
