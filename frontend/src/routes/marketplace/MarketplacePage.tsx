import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Home,
  LayoutGrid,
  List,
  Megaphone,
  Search,
  SlidersHorizontal,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { LogoLink } from "@/components/common/Logo";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductImage } from "@/components/product/ProductImage";
import { PriceRangeFilter } from "@/components/product/PriceRangeFilter";
import { QueryError } from "@/components/common/QueryError";
import { Sheet } from "@/components/ui/Modal";
import { ProductCardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import { useSeo } from "@/hooks/useSeo";
import { colorHex, sortSizes } from "@/lib/constants";
import { formatKes } from "@/lib/currency";
import { homeSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { BannerProduct, Product } from "@/types";

type SortOrder = "newest" | "price-asc" | "price-desc";

const PAGE_SIZE = 12;
const GRID_CLASS = "grid grid-cols-2 gap-3 xl:grid-cols-3";
const LIST_CLASS = "flex flex-col gap-3";

/**
 * The marketplace.
 *
 * This is the front door now: `/` used to be the seller pitch, which is the
 * wrong page to land a shopper on when the whole point is that there are shops
 * to browse. The pitch still exists at /welcome, where the marketing nav points.
 *
 * Everything here is a composition of services that already existed —
 * searchProducts() has taken a null merchant since migration 0023, listShops()
 * is the directory, getFacets() aggregates across every shop when given a null.
 *
 * THE BANNER IS TWO STRIPS, and the order is the product decision. Paid
 * placements come first (PromotedStrip, migration 0048) and are labelled as
 * paid; under them, one product from EVERY registered shop, rotated hourly and
 * bought by nobody (ShopFeatureStrip, migration 0046). Selling the top slot is
 * how the platform earns; keeping the second strip unsellable is what stops the
 * front page collapsing into an advert board where a shop that opened this
 * morning is invisible. Neither replaces the other.
 */
export function MarketplacePage() {
  useSeo(useMemo(() => homeSeo(window.location.origin), []));

  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");

  const toggleIn = (setter: (fn: (v: string[]) => string[]) => void) => (value: string) =>
    setter((list) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]));

  const activeFilterCount =
    sizes.length +
    colors.length +
    (availableOnly ? 1 : 0) +
    // The band counts as ONE filter however many ends are set: "3,000 to 5,000"
    // is one decision the shopper made, and badging it as two overstates how
    // much is switched on.
    (minPrice !== null || maxPrice !== null ? 1 : 0) +
    (minRating !== null ? 1 : 0) +
    (category !== "All" ? 1 : 0);

  const clearFilters = () => {
    setSizes([]);
    setColors([]);
    setAvailableOnly(false);
    setMinPrice(null);
    setMaxPrice(null);
    setMinRating(null);
    setCategory("All");
  };

  const appliedFilters: { key: string; label: string; remove: () => void }[] = [
    ...(category !== "All"
      ? [{ key: "cat", label: category, remove: () => setCategory("All") }]
      : []),
    ...sizes.map((s) => ({ key: `size:${s}`, label: s, remove: () => toggleIn(setSizes)(s) })),
    ...colors.map((c) => ({ key: `color:${c}`, label: c, remove: () => toggleIn(setColors)(c) })),
    ...(availableOnly
      ? [{ key: "avail", label: "Available only", remove: () => setAvailableOnly(false) }]
      : []),
    ...(minPrice !== null || maxPrice !== null
      ? [
          {
            key: "price",
            label: priceChipLabel(minPrice, maxPrice),
            remove: () => {
              setMinPrice(null);
              setMaxPrice(null);
            },
          },
        ]
      : []),
    ...(minRating !== null
      ? [{ key: "rating", label: `${minRating}+ stars`, remove: () => setMinRating(null) }]
      : []),
  ];

  const productQuery = {
    search: term,
    category,
    status: availableOnly ? ("in-stock" as const) : ("all" as const),
    minPrice,
    maxPrice,
    sizes,
    colors,
    minRating,
    sort,
    pageSize: PAGE_SIZE,
  };

  const productsQ = useInfiniteQuery({
    queryKey: ["marketplace-products", productQuery],
    queryFn: ({ pageParam }) =>
      services.products.searchProducts({ ...productQuery, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? all.length + 1 : undefined;
    },
    placeholderData: keepPreviousData,
  });

  const products = productsQ.data?.pages.flatMap((p) => p.items) ?? [];
  const totalMatches = productsQ.data?.pages[0]?.total ?? 0;

  // Explicit null = every shop. OMITTING the argument means "the signed-in
  // merchant's own catalogue", which is what this used to pass by accident: the
  // front page asked for one shop's facets, and for a guest, who has no id, the
  // call threw outright and the whole filter panel rendered empty.
  const facetsQ = useQuery({
    queryKey: ["marketplace-facets"],
    queryFn: () => services.products.getFacets(null),
  });
  const categories = ["All", ...(facetsQ.data?.categories ?? [])];
  const priceFloor = facetsQ.data?.priceFloor ?? 0;
  const priceCeiling = facetsQ.data?.priceCeiling ?? 0;
  const sizeOptions = sortSizes(facetsQ.data?.sizes ?? []);
  const colorOptions = facetsQ.data?.colors ?? [];

  const featuresQ = useQuery({
    queryKey: ["shop-features"],
    queryFn: () => services.products.listShopFeatures(8),
  });

  // The bought slots (migration 0048). A separate query from the free rotation
  // above, so a failure in one cannot blank the other: if paid placement is
  // unreachable the page still shows the shops, which is the half that matters
  // more.
  const placementsQ = useQuery({
    queryKey: ["banner-placements"],
    queryFn: () => services.products.listBannerPlacements(6),
  });

  const shopsQ = useQuery({
    queryKey: ["marketplace-shops"],
    queryFn: () => services.follows.listShops({ pageSize: 8 }),
  });

  const filterControls = (
    <>
      <div>
        <h2 className="text-sm font-bold text-ink">Category</h2>
        <ul className="mt-3 space-y-1">
          {categories.map((cat) => (
            <li key={cat}>
              <button
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  "w-full rounded-btn px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
                  cat === category ? "bg-primary/10 text-primary" : "text-muted hover:text-ink",
                )}
              >
                {cat}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {sizeOptions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-ink">Size</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {sizeOptions.map((s) => (
              <Chip key={s} label={s} active={sizes.includes(s)} onClick={() => toggleIn(setSizes)(s)} />
            ))}
          </div>
        </div>
      )}

      {colorOptions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-ink">Colour</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {colorOptions.map((c) => (
              <Chip
                key={c}
                label={c}
                swatch={colorHex(c)}
                active={colors.includes(c)}
                onClick={() => toggleIn(setColors)(c)}
              />
            ))}
          </div>
        </div>
      )}

      {priceCeiling > 0 && (
        <PriceRangeFilter
          floor={priceFloor}
          ceiling={priceCeiling}
          min={minPrice}
          max={maxPrice}
          onChange={({ min, max }) => {
            setMinPrice(min);
            setMaxPrice(max);
          }}
        />
      )}

      <div>
        <h2 className="text-sm font-bold text-ink">Rating</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {[4, 3, 2].map((r) => (
            <Chip
              key={r}
              label={`${r}+`}
              active={minRating === r}
              onClick={() => setMinRating(minRating === r ? null : r)}
            />
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={availableOnly}
          onChange={(e) => setAvailableOnly(e.target.checked)}
          className="size-4 accent-primary"
        />
        Available only
      </label>
    </>
  );

  return (
    <MobileShell homeTo="/" wide>
      <header className="glass-header sticky top-0 z-30 px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <LogoLink size={30} wordmark />
          <div className="hidden min-w-0 flex-1 lg:block lg:max-w-md">
            <SearchField value={search} onChange={setSearch} />
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              to="/shops"
              className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-muted hover:text-ink lg:flex"
            >
              All shops
              <ChevronRight className="size-4" />
            </Link>
            {/* Home is a no-op on this page and still belongs here: it is the
                same control in the same place on every buyer route, and one
                that disappears on the page it points at is one people stop
                looking for. aria-current says it is already the current page
                rather than hiding it from a screen reader. */}
            <Link
              to="/"
              aria-label="Home"
              aria-current="page"
              className="flex size-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Home className="size-5" />
            </Link>
            <ProfileMenu />
          </div>
        </div>
        <div className="mt-2.5 lg:hidden">
          <SearchField value={search} onChange={setSearch} />
        </div>
      </header>

      <div className="px-4 pb-6 pt-4 lg:px-6">
        <PromotedStrip items={placementsQ.data ?? []} />
        <ShopFeatureStrip
          items={featuresQ.data ?? []}
          loading={featuresQ.isLoading}
          className={(placementsQ.data?.length ?? 0) > 0 ? "mt-5" : undefined}
        />

        {/* Filters left, grid centre, shops right — the storefront already put
            its filters on the left, and having them swap sides between the two
            browsing pages would be the kind of inconsistency nobody can name but
            everybody feels. */}
        <div className="mt-5 lg:flex lg:gap-6 xl:gap-8">
          <aside className="hidden shrink-0 lg:block lg:w-52">
            <div className="space-y-6">{filterControls}</div>
          </aside>

          <section className="min-w-0 flex-1">
            <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 lg:hidden">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : "Filters"}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold",
                  activeFilterCount > 0 ? "bg-ink text-on-accent" : "bg-card text-muted shadow-soft",
                )}
              >
                <SlidersHorizontal className="size-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-on-accent/25 text-[11px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {categories.slice(0, 8).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold",
                    cat === category ? "bg-primary text-on-accent" : "bg-card text-muted shadow-soft",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {appliedFilters.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {appliedFilters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={f.remove}
                    aria-label={`Remove filter: ${f.label}`}
                    className="flex min-h-8 items-center gap-1 rounded-full bg-primary/10 pl-3 pr-2 text-xs font-semibold text-primary hover:bg-primary/20"
                  >
                    {f.label}
                    <X className="size-3.5" aria-hidden />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-8 rounded-full px-2 text-xs font-semibold text-muted hover:text-ink hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}

            {!productsQ.isLoading && !productsQ.isError && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">
                  {totalMatches} {totalMatches === 1 ? "product" : "products"} across every shop
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-btn border border-line bg-card p-0.5">
                    {([
                      ["grid", LayoutGrid, "Grid view"],
                      ["list", List, "List view"],
                    ] as const).map(([v, Icon, label]) => (
                      <button
                        key={v}
                        type="button"
                        aria-label={label}
                        aria-pressed={view === v}
                        onClick={() => setView(v)}
                        className={cn(
                          "flex size-8 items-center justify-center rounded-[10px] transition-colors",
                          view === v ? "bg-primary text-on-accent" : "text-muted hover:text-ink",
                        )}
                      >
                        <Icon className="size-4" />
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <span className="hidden sm:inline">Sort by</span>
                    <select
                      aria-label="Sort by"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SortOrder)}
                      className="rounded-btn border border-line bg-card px-2.5 py-1.5 text-sm font-semibold text-ink outline-none focus:border-primary"
                    >
                      <option value="newest">Newest</option>
                      <option value="price-asc">Price: Low to High</option>
                      <option value="price-desc">Price: High to Low</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            {productsQ.isLoading ? (
              <div className={view === "grid" ? GRID_CLASS : LIST_CLASS}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <ProductCardSkeleton key={i} layout={view === "list" ? "row" : "grid"} />
                ))}
              </div>
            ) : productsQ.isError ? (
              <QueryError
                title="Couldn't load the marketplace"
                onRetry={() => productsQ.refetch()}
                retrying={productsQ.isFetching}
              />
            ) : products.length === 0 ? (
              <div className="rounded-card bg-card p-8 text-center shadow-soft">
                <p className="font-semibold text-ink">Nothing matches that</p>
                <p className="mt-1 text-sm text-muted">Try a different search or clear the filters.</p>
              </div>
            ) : (
              <>
                <div className={cn("animate-grid-fade", view === "grid" ? GRID_CLASS : LIST_CLASS)}>
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} layout={view === "list" ? "row" : "grid"} />
                  ))}
                </div>
                {productsQ.hasNextPage && (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => productsQ.fetchNextPage()}
                      disabled={productsQ.isFetchingNextPage}
                      className="w-full rounded-btn border border-line bg-card px-6 py-3 text-sm font-bold text-ink shadow-soft disabled:opacity-60 lg:w-auto"
                    >
                      {productsQ.isFetchingNextPage
                        ? "Loading…"
                        : `Load more (${totalMatches - products.length} left)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Shops rail. The social half of the merge: a shopper who likes what
              they see should be able to go to the seller, not just the SKU. */}
          <aside className="mt-6 shrink-0 lg:mt-0 lg:w-60">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">Shops to explore</h2>
              <Link to="/shops" className="text-xs font-semibold text-primary hover:underline">
                See all
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {shopsQ.isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-card bg-card p-2.5 shadow-soft">
                      <Skeleton className="size-9 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-24 rounded" />
                        <Skeleton className="h-3 w-16 rounded" />
                      </div>
                    </div>
                  ))
                : (shopsQ.data?.items ?? []).map((shop) => (
                    <Link
                      key={shop.id}
                      to={`/${shop.handle}`}
                      className="flex items-center gap-2.5 rounded-card bg-card p-2.5 shadow-soft transition-shadow hover:shadow-md"
                    >
                      {shop.avatarUrl ? (
                        <img
                          src={shop.avatarUrl}
                          alt=""
                          className="size-9 shrink-0 rounded-full object-cover ring-2 ring-line-soft"
                        />
                      ) : (
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Store className="size-4 text-primary" />
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
                  ))}
            </div>
          </aside>
        </div>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <div className="space-y-6">
          {filterControls}
          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            className="w-full rounded-btn bg-primary px-6 py-3 text-sm font-bold text-on-accent"
          >
            Show {totalMatches} {totalMatches === 1 ? "product" : "products"}
          </button>
        </div>
      </Sheet>
    </MobileShell>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * How a price band reads as a removable chip.
 *
 * Three phrasings rather than one template, because "KES 0 to KES 5,000" is a
 * worse label than "Under KES 5,000" for the same filter, and an open-ended
 * bottom is genuinely a different sentence from a closed band.
 */
function priceChipLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${formatKes(min)} to ${formatKes(max)}`;
  if (min !== null) return `${formatKes(min)} and up`;
  return `Under ${formatKes(max ?? 0)}`;
}

/**
 * The bought slots at the top of the marketplace (migration 0048).
 *
 * LABELLED, always. Each tile says "Promoted", and the strip says so again in
 * its heading. That is not a legal checkbox: the whole reason the free rotation
 * below it works is that shoppers can tell the two apart, and a paid slot that
 * looks identical to an earned one devalues both. It is also the only honest
 * way to run paid placement on a page that also claims to give every shop a
 * turn.
 *
 * Renders nothing at all when nobody has bought a slot, rather than a "no
 * promotions yet" placeholder — an empty advert rail is not information a
 * shopper needs.
 */
function PromotedStrip({ items }: { items: BannerProduct[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-label="Promoted products">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Megaphone className="size-4 text-warning" aria-hidden />
        <h2 className="text-sm font-bold text-ink">Promoted</h2>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0">
        {items.map((p) => (
          <Link
            key={p.placementId}
            to={`/${p.shopSlug}/${p.slug}`}
            className="group relative w-64 shrink-0 overflow-hidden rounded-card bg-card shadow-soft ring-1 ring-warning/30 transition-shadow hover:shadow-md lg:w-auto"
          >
            <div className="flex h-40">
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-4">
                <span className="flex w-fit items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                  Promoted
                </span>
                {/* The headline is the copy the seller paid for; without one the
                    product's own name does the job, which is why null is a
                    perfectly ordinary value here rather than missing data. */}
                <p className="line-clamp-2 text-sm font-extrabold leading-snug text-ink">
                  {p.headline?.trim() || p.name}
                </p>
                {p.shopName && (
                  <p className="truncate text-xs font-semibold text-muted">{p.shopName}</p>
                )}
                <p className="text-sm font-extrabold text-primary">{formatKes(p.priceKes)}</p>
              </div>
              <div className="w-28 shrink-0 overflow-hidden bg-fill">
                <ProductImage
                  src={p.images[0]}
                  alt={p.imageAlts?.[0]?.trim() || p.name}
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search every shop"
        placeholder="Search every shop…"
        className="h-11 w-full rounded-btn border border-line bg-card pl-9 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-fill hover:text-ink"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * One product from every shop on the platform.
 *
 * This used to be paid placement, which was pulled in 0046. Nothing here is
 * bought: the database picks one product per registered shop and rotates the
 * selection hourly, so a shop that opened this morning sits beside the busiest
 * one on the platform. That is the point of leading the page with it, and it is
 * why the heading says which shop rather than that anything is featured.
 */
function ShopFeatureStrip({
  items,
  loading,
  className,
}: {
  items: Product[];
  loading: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div
        className={cn(
          "no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0",
          className,
        )}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-64 shrink-0 lg:w-auto" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <section aria-label="A product from each shop" className={className}>
      <div className="mb-2.5 flex items-center gap-1.5">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-bold text-ink">From the shops on PulseShop</h2>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0">
        {items.map((p) => (
          <Link
            key={p.id}
            to={`/${p.shopSlug}/${p.slug}`}
            className="group relative w-64 shrink-0 overflow-hidden rounded-card bg-card shadow-soft transition-shadow hover:shadow-md lg:w-auto"
          >
            <div className="flex h-40">
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-4">
                {p.shopName && (
                  <span className="flex w-fit items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                    <Store className="size-3" aria-hidden />
                    <span className="max-w-32 truncate">{p.shopName}</span>
                  </span>
                )}
                <p className="line-clamp-2 text-sm font-extrabold leading-snug text-ink">{p.name}</p>
                <p className="text-sm font-extrabold text-primary">{formatKes(p.priceKes)}</p>
              </div>
              <div className="w-28 shrink-0 overflow-hidden bg-fill">
                <ProductImage
                  src={p.images[0]}
                  alt={p.imageAlts?.[0]?.trim() || p.name}
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Chip({
  label,
  active,
  onClick,
  swatch,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-9 items-center gap-1.5 rounded-btn border-2 px-2.5 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-on-accent"
          : "border-line bg-card text-ink hover:border-primary/50",
      )}
    >
      {swatch && (
        <span
          aria-hidden
          style={{ backgroundColor: swatch }}
          className="size-4 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
        />
      )}
      {label}
    </button>
  );
}
