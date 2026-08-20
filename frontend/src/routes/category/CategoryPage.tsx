import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { PackageSearch, Store } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router";

import { MobileShell } from "@/components/layout/MobileShell";
import { LogoLink } from "@/components/common/Logo";
import { QueryError } from "@/components/common/QueryError";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/Skeleton";
import { useSeo } from "@/hooks/useSeo";
import { CATEGORIES } from "@/lib/constants";
import { categoryPath, categorySeo, categorySlug, privateSeo } from "@/lib/seo";
import { seoCategoryFrom } from "@/lib/seoFrom";
import { services } from "@/services";

const PAGE_SIZE = 24;

/**
 * Everything in one category, across every shop.
 *
 * THE PAGE THIS SITE DID NOT HAVE. A storefront answers "gamerhq". A product
 * page answers "nintendo switch 2 nairobi". Neither answers "gaming consoles in
 * kenya" — the query with real volume, and the one a shopper types before they
 * know which shop to trust. That middle tier is what marketplaces rank on, and
 * PulseShop had no page for it at all.
 *
 * The category name is resolved from the FIXED taxonomy in lib/constants.ts,
 * not from whatever the URL says. That matters: with a free-text mapping,
 * /category/anything would render a heading reading "Anything" and a shopper
 * could mint an arbitrary page on the domain just by editing the address bar.
 * A slug outside the taxonomy is not a category, so it is a 404.
 */
export function CategoryPage() {
  const { slug = "" } = useParams();

  // Built once. The taxonomy is a module-level constant, so this is a pure
  // function of nothing and does not belong in the render path.
  const name = useMemo(
    () => CATEGORIES.find((c) => categorySlug(c) === slug) ?? "",
    [slug],
  );

  const productsQ = useInfiniteQuery({
    queryKey: ["category-products", name],
    queryFn: ({ pageParam }) =>
      services.products.searchProducts({ category: name, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? all.length + 1 : undefined;
    },
    enabled: Boolean(name),
    placeholderData: keepPreviousData,
  });

  const products = productsQ.data?.pages.flatMap((p) => p.items) ?? [];
  const total = productsQ.data?.pages[0]?.total ?? 0;

  /**
   * Tags only once the count is known.
   *
   * categorySeo() decides indexability from productCount, so applying it while
   * the query is still in flight would briefly claim the page has zero listings
   * and mark it noindex — on a page the server just served as indexable. Null
   * until then leaves the server's tags in place, which are already correct.
   */
  useSeo(
    useMemo(() => {
      if (!name) return privateSeo();
      if (productsQ.isLoading || productsQ.isError) return null;
      return categorySeo(
        seoCategoryFrom(name, slug, products, total),
        window.location.origin,
      );
    }, [name, slug, products, total, productsQ.isLoading, productsQ.isError]),
  );

  // The shops behind the loaded page, for the cross-links that make this page
  // worth more to a crawler than a filtered grid.
  const shops = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of products) {
      if (p.shopSlug && !seen.has(p.shopSlug)) seen.set(p.shopSlug, p.shopName ?? p.shopSlug);
    }
    return [...seen.entries()];
  }, [products]);

  if (!name) {
    return (
      <MobileShell wide>
        <div className="flex flex-col items-center gap-3 px-4 py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-fill">
            <PackageSearch className="size-7 text-muted" />
          </div>
          <h1 className="text-lg font-extrabold text-ink">No such category</h1>
          <p className="max-w-sm text-sm text-muted">
            We don't have a category at that address. Browse the marketplace instead.
          </p>
          <Link
            to="/"
            className="mt-2 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-on-accent"
          >
            Go to the marketplace
          </Link>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell wide>
      <header className="glass-header sticky top-0 z-30 flex items-center gap-3 px-4 py-4 lg:px-6">
        <LogoLink size={40} />
        <div className="min-w-0">
          {/* Matches the server-rendered <h1> in api/_prerender.ts verbatim.
              The two must say the same thing — a crawler that renders the page
              and one that does not are looking at the same URL. */}
          <h1 className="truncate text-lg font-extrabold text-ink lg:text-xl">
            {name} in Kenya
          </h1>
          <p className="truncate text-xs font-medium text-muted lg:text-sm">
            {productsQ.isLoading
              ? "Loading listings"
              : `${total} ${total === 1 ? "listing" : "listings"} from ${shops.length} ${
                  shops.length === 1 ? "shop" : "shops"
                }`}
          </p>
        </div>
      </header>

      <div className="px-4 pb-8 lg:px-6">
        {shops.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 text-sm font-bold text-ink">Shops stocking {name}</h2>
            <ul className="flex flex-wrap gap-2">
              {shops.map(([handle, shopName]) => (
                <li key={handle}>
                  <Link
                    to={`/${handle}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-ink shadow-soft"
                  >
                    <Store className="size-3.5 text-primary" />
                    {shopName}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {productsQ.isError ? (
          <QueryError
            title={`Couldn't load ${name}`}
            onRetry={() => productsQ.refetch()}
            retrying={productsQ.isFetching}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {productsQ.isLoading
              ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}

        {!productsQ.isLoading && !productsQ.isError && products.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-card bg-card p-8 text-center shadow-soft">
            <div className="flex size-14 items-center justify-center rounded-full bg-fill">
              <PackageSearch className="size-7 text-muted" />
            </div>
            <p className="font-semibold text-ink">Nothing here yet</p>
            <p className="text-sm text-muted">
              No shop has listed {name.toLowerCase()} yet. Check back soon.
            </p>
          </div>
        )}

        {productsQ.hasNextPage && (
          <button
            type="button"
            onClick={() => productsQ.fetchNextPage()}
            disabled={productsQ.isFetchingNextPage}
            className="mx-auto mt-5 block rounded-btn bg-card px-5 py-2.5 text-sm font-semibold text-ink shadow-soft disabled:opacity-60"
          >
            {productsQ.isFetchingNextPage
              ? "Loading…"
              : `Load more (${total - products.length} left)`}
          </button>
        )}

        {/* Sideways links to the rest of the taxonomy. A category page that only
            links down to products is a dead end for a crawler; these are how the
            other category pages get discovered and re-crawled. */}
        <nav aria-label="Other categories" className="mt-10">
          <h2 className="mb-2 text-sm font-bold text-ink">Browse other categories</h2>
          <ul className="flex flex-wrap gap-2">
            {CATEGORIES.filter((c) => c !== name).map((c) => (
              <li key={c}>
                <Link
                  to={categoryPath(categorySlug(c))}
                  className="inline-block rounded-full bg-fill px-3 py-1.5 text-xs font-semibold text-ink"
                >
                  {c}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </MobileShell>
  );
}
