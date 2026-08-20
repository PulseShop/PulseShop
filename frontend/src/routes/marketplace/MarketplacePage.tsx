import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Baby,
  BookOpen,
  Camera,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Footprints,
  Gamepad2,
  Gem,
  Headphones,
  Heart,
  LayoutGrid,
  Laptop,
  List,
  Megaphone,
  Music4,
  Package,
  PawPrint,
  Search,
  Shirt,
  SlidersHorizontal,
  Smartphone,
  Sofa,
  Sparkles,
  SprayCan,
  Store,
  Tv,
  Utensils,
  Watch,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { LogoLink } from "@/components/common/Logo";
import { DesktopQuickNav } from "@/components/layout/DesktopQuickNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { BrowsingHistoryRail } from "@/components/product/BrowsingHistoryRail";
import { CategoryWall } from "@/components/product/CategoryWall";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductImage } from "@/components/product/ProductImage";
import { PriceRangeFilter } from "@/components/product/PriceRangeFilter";
import { QueryError } from "@/components/common/QueryError";
import { Sheet } from "@/components/ui/Modal";
import { ProductCardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import { useSeo } from "@/hooks/useSeo";
import { colorHex, sortSizes } from "@/lib/constants";
import { formatKes, hasPriceRange, minVariantPrice } from "@/lib/currency";
import { productHref } from "@/lib/productUrl";
import { homeSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { lastViewed, useBrowsingHistory } from "@/stores/browsingHistory";
import { useFavorites } from "@/stores/favorites";
import type { ViewedProduct } from "@/stores/browsingHistory";
import type { BannerProduct, Merchant, Product } from "@/types";

type SortOrder = "newest" | "price-asc" | "price-desc";

const PAGE_SIZE = 12;
const GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4";
const LIST_CLASS = "flex flex-col gap-3";

/**
 * How long one promoted product holds the hero, in milliseconds.
 *
 * Twelve seconds. Long enough to read a headline, a shop name and a price
 * without racing it, short enough that the eighth advertiser in a full
 * rotation is still reachable inside a couple of minutes. The dot that fills
 * under the slide is driven from this same constant, so the thing the shopper
 * is shown and the thing the timer does cannot drift apart.
 */
const ROTATE_MS = 12_000;

/**
 * The marketplace.
 *
 * This is the front door: `/` used to be the seller pitch, which is the wrong
 * page to land a shopper on when the whole point is that there are shops to
 * browse. The pitch still exists at /welcome, where the marketing nav points.
 *
 * THE PAGE IS A BENTO OVER A CATALOGUE. The top screenful is four panels of
 * different sizes — a hero, a shop collage, colours, shops — and everything
 * under it is the filterable grid that was always here. The split is not
 * decorative: the top half answers "what is worth looking at", which is a
 * browsing question and wants big pictures, and the bottom half answers "find
 * me this", which is a searching question and wants filters and density. The
 * old page led with three small identical strips, which served the second
 * question twice and the first not at all.
 *
 * THE HERO IS PAID PLACEMENT, AND ONLY PAID PLACEMENT. One product at a time,
 * rotating every twelve seconds, labelled Promoted on every slide (migrations
 * 0048 and 0049). It is a rotation rather than a row because a row prices its
 * slots by position — slot one is worth more than slot three and slot seven is
 * worth nothing — whereas a rotation sells the same thing to everybody. When
 * nobody has bought a slot the hero carries the platform's own copy instead of
 * quietly filling with free content, because a shopper who cannot tell the two
 * apart is the thing that makes the Promoted label worthless.
 *
 * THE FREE ROTATION IS STILL HERE AND STILL UNSELLABLE. One product from every
 * registered shop, picked and rotated hourly by the database (migration 0046).
 * It leads the collage panel and continues in the rail below the bento. Selling
 * the hero is how the platform earns; keeping this half unbuyable is what stops
 * the front page collapsing into an advert board where a shop that opened this
 * morning is invisible. Neither replaces the other.
 */
export function MarketplacePage() {
  useSeo(useMemo(() => homeSeo(window.location.origin), []));

  /**
   * The search box, seeded from `?q=`.
   *
   * Not local-only state. The product page's own search field navigates here
   * with `?q=...` (see submitSearch in ProductDetailPage), and until now this
   * page ignored the parameter completely — searching from a product dropped
   * you on an unfiltered front page. Seeding from the URL also makes a search
   * shareable and survivable across a reload.
   */
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const term = useDebounced(search.trim());

  // Mirror the settled term back into the URL, replacing rather than pushing:
  // every keystroke would otherwise be a history entry and Back would walk the
  // shopper letter by letter out of their own query.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (current === term) return;
    const next = new URLSearchParams(params);
    if (term) next.set("q", term);
    else next.delete("q");
    setParams(next, { replace: true });
    // `params` is deliberately absent: this effect owns the q parameter and
    // reacting to its own write would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  /** Searching is a different intent from browsing, and the page changes shape
   *  for it — see the note on the bento below. */
  const isSearching = term.length > 0;
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

  // The bought slots (migrations 0048 and 0049). A separate query from the free
  // rotation above, so a failure in one cannot blank the other: if paid
  // placement is unreachable the page still shows the shops, which is the half
  // that matters more.
  const placementsQ = useQuery({
    queryKey: ["banner-placements"],
    queryFn: () => services.products.listBannerPlacements(),
  });

  const shopsQ = useQuery({
    queryKey: ["marketplace-shops"],
    queryFn: () => services.follows.listShops({ pageSize: 8 }),
  });

  /**
   * The category wall's tiles (migration 0057).
   *
   * Its own query, like the two banner halves above and for the same reason: a
   * failure here must not blank the products underneath it. CategoryWall
   * renders nothing at all when this comes back empty or errored, so an
   * unapplied migration degrades to the page as it was rather than to an error
   * screen over the whole marketplace.
   */
  const showcaseQ = useQuery({
    queryKey: ["category-showcase"],
    queryFn: () => services.products.listCategoryShowcase(),
  });

  /* ----------------------------------------------------------------------- *
   * Search: the match first, then what surrounds it.
   *
   * The matches themselves are ordered by relevance server-side (migration
   * 0050), so products[0] is the best hit rather than merely the newest one.
   * These two queries are the "and then" half of the request: once a shopper
   * has found the thing, the useful next question is what else is like it, and
   * that is answered by its category and by its shop.
   *
   * Both are gated on `isSearching`, so a browsing visitor pays for neither.
   * ----------------------------------------------------------------------- */
  const topHit = isSearching ? products[0] : undefined;

  const relatedCategoryQ = useQuery({
    queryKey: ["search-related-category", topHit?.category],
    queryFn: () =>
      services.products.searchProducts({ category: topHit!.category, pageSize: 12 }),
    enabled: Boolean(topHit?.category),
  });

  // The shop behind the best match, resolved from its handle because a Product
  // row carries the handle but not the merchant id.
  const topHitShopQ = useQuery({
    queryKey: ["shop", topHit?.shopSlug],
    queryFn: () => services.products.getShop(topHit!.shopSlug!),
    enabled: Boolean(topHit?.shopSlug),
  });

  const relatedShopQ = useQuery({
    queryKey: ["search-related-shop", topHitShopQ.data?.id],
    queryFn: () =>
      services.products.listShopProducts(topHitShopQ.data!.id, { pageSize: 12 }),
    enabled: Boolean(topHitShopQ.data?.id),
  });

  /**
   * Related products, minus anything the shopper is already looking at.
   *
   * Category first, then the shop, because "more like this" is a stronger
   * signal than "more from these people" — someone searching for a phone
   * charger wants other chargers before they want that seller's shoes.
   */
  const relatedProducts = useMemo(() => {
    if (!isSearching) return [];
    const shown = new Set(products.map((p) => p.id));
    const out: Product[] = [];
    for (const p of [
      ...(relatedCategoryQ.data?.items ?? []),
      ...(relatedShopQ.data?.items ?? []),
    ]) {
      if (shown.has(p.id)) continue;
      shown.add(p.id);
      out.push(p);
      if (out.length === 8) break;
    }
    return out;
  }, [isSearching, products, relatedCategoryQ.data, relatedShopQ.data]);

  const features = featuresQ.data ?? [];
  // The collage takes the first four of the free rotation and the rail below the
  // bento continues from where it stopped, so a shop appears in exactly one of
  // them. Splitting the same list rather than querying twice is what keeps "one
  // product from EVERY shop" true across both.
  //
  // Four, not three, because four is how many shops a young platform has: at
  // three the collage was full and the rail below it held a single lonely card,
  // which reads as a rendering fault rather than as a small marketplace.
  const collageItems = features.slice(0, 4);
  const railItems = features.slice(4);

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
      {/*
        THE MASTHEAD, AND WHY THE TWO WIDTHS CARRY DIFFERENT SETS.

        On a phone the row is exactly four things: the logo (home), the search
        field, wishlist, account. It is short because it can be — Home, Shops
        and Cart are already permanent tabs in the bottom bar three inches
        below, so putting them up here too spends the narrowest strip on the
        site restating controls the shopper can already see.

        Wishlist is the exception that earns its place. It is a tab down there
        as well, but it is the one control shoppers reach for mid-browse while
        their thumb is at the top of a scrolled page, and its badge is the only
        thing in the row that carries a changing number.

        On desktop the bottom bar does not exist (BottomNav is lg:hidden), so
        the same trim would leave Cart with nowhere to live and strand a
        shopper's basket. The full icon row stays there for that reason, not
        for symmetry.
      */}
      <header className="glass-header sticky top-0 z-30 px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <LogoLink size={32} wordmark />
          <div className="hidden min-w-0 flex-1 lg:block lg:max-w-md">
            <SearchField value={search} onChange={setSearch} />
          </div>
          {/* Home is a no-op on this page and still sits in this row: it is the
              same control in the same place on every buyer route, and one that
              disappears on the page it points at is one people stop looking
              for. It renders active here rather than being hidden. */}
          <DesktopQuickNav />
        </div>

        {/* Phone: search and wishlist share the second line.
            The row used to be search alone; the wishlist icon joins it as the
            one destination worth reaching without scrolling back to a tab bar,
            because it is where a shopper parks things mid-browse and the only
            control up here carrying a number that changes as they do it.
            Cart, Shops and Home are NOT here — they are permanent tabs three
            inches below, and restating them would spend the narrowest strip on
            the site on controls already in view. */}
        <div className="mt-2.5 flex items-center gap-2 lg:hidden">
          <div className="min-w-0 flex-1">
            <SearchField value={search} onChange={setSearch} />
          </div>
          <WishlistButton />
        </div>
      </header>

      <div className="px-4 pb-6 pt-4 lg:px-6">
        {/* The page's one h1. It is off-screen because the visible headline is
            whichever product happens to be in the hero this second, and a
            document outline that changes every twelve seconds is no outline. */}
        <h1 className="sr-only">PulseShop marketplace — every shop in one place</h1>

        {/* THE BENTO. Twelve columns past lg: the hero takes seven because it
            is the only panel carrying a photograph at display size, the collage
            three, and the two stacked cards share the last two. Below lg it is
            one column in the same order, which is also reading order.

            IT DISAPPEARS THE MOMENT SOMEBODY SEARCHES. A shopper who typed a
            query has told you exactly what they want, and making them scroll
            past a hero, a collage and two side panels to reach it is the site
            arguing with them. On a phone that was most of a screen of furniture
            before the first result. Browsing gets the bento; searching gets
            results at the top of the page. */}
        {!isSearching && (
          <div className="grid gap-3 lg:grid-cols-12 lg:gap-4">
            <PromotedHero
              className="lg:col-span-7"
              items={placementsQ.data ?? []}
              loading={placementsQ.isLoading}
              fallbackImages={features.slice(0, 4)}
              categories={categories}
              category={category}
              onCategory={setCategory}
            />

            <ShopCollageCard
              className="lg:col-span-3"
              items={collageItems}
              loading={featuresQ.isLoading}
            />

            {/* Desktop only. On a phone this column was a colour swatch panel
                and a shop list stacked between the hero and the products —
                two panels of browsing aids in the narrowest place on the site,
                pushing the actual catalogue below a second screenful. Both
                live on elsewhere: colours in the filter sheet, shops on /shops
                and in the bottom tab bar.

                auto-rows-min so the cards keep their natural heights rather
                than splitting the row between them. */}
            <div className="hidden auto-rows-min gap-3 lg:col-span-2 lg:grid lg:grid-cols-1 lg:gap-4">
              <RecommendationsCard />
              <ShopsCard shops={shopsQ.data?.items ?? []} loading={shopsQ.isLoading} />
            </div>
          </div>
        )}

        {/* THE SHOPS, EXPANDED, ON PHONES.
            The bento column that carries "Explore shops" is desktop-only,
            which left the phone layout with the collage above — four
            photographs and one shop's name — as the entire answer to "who
            sells here". The collage shows MERCHANDISE; this shows SELLERS, and
            they are different questions. A rail rather than the desktop card's
            vertical list because horizontal is the shape that fits eight shops
            into a phone's width without pushing the catalogue down a screen. */}
        {!isSearching && (
          <ShopsRail
            shops={shopsQ.data?.items ?? []}
            loading={shopsQ.isLoading}
            className="mt-5 lg:hidden"
          />
        )}

        {!isSearching && (
          <ShopFeatureStrip items={railItems} loading={featuresQ.isLoading} className="mt-5" />
        )}

        {/* The taxonomy as merchandise. Sits between the browsing panels and
            the catalogue because that is what it is for: the bento says "look
            at this", the grid below says "find me that", and this is the step
            in between — what is sold here at all. Hidden while searching for
            the same reason the bento is: a shopper who typed a query has
            already answered the question this section asks. */}
        {!isSearching && (
          <CategoryWall
            entries={showcaseQ.data ?? []}
            loading={showcaseQ.isLoading}
            className="mt-6 lg:mt-8"
          />
        )}

        {/* Filters left, grid right — the storefront already put its filters on
            the left, and having them swap sides between the two browsing pages
            would be the kind of inconsistency nobody can name but everybody
            feels. The shops rail that used to sit on the right is now a bento
            card; two lists of the same shops on one screen was one too many. */}
        <div className="mt-5 lg:flex lg:gap-6 xl:gap-8">
          <aside className="hidden shrink-0 lg:block lg:w-52">
            <div className="space-y-6">{filterControls}</div>
          </aside>

          <section className="min-w-0 flex-1">
            {/* Categories are in the hero's rail now, at every width, so this
                row carries the one control that has nowhere else to be. */}
            <div className="mb-3 lg:hidden">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : "Filters"}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold",
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
                {Array.from({ length: 8 }).map((_, i) => (
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
              <div className="rounded-bento bg-card p-8 text-center shadow-soft">
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

            {/* What surrounds the match. Only while searching, and only under
                the matches — a shopper who found the thing is done, and this is
                for the one who did not. Kept visually quieter than the grid
                above (a plain heading, the same tiles) so it reads as a second
                answer rather than as more results for the query. */}
            {isSearching && relatedProducts.length > 0 && (
              <section aria-label="Related products" className="mt-8">
                <h2 className="mb-3 text-sm font-bold text-ink">
                  {/* Trimmed: seller-entered names carry stray trailing spaces,
                      and the quote marks put them on display. */}
                  {topHit ? `More like "${topHit.name.trim()}"` : "Related products"}
                </h2>
                <div className={GRID_CLASS}>
                  {relatedProducts.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            )}
          </section>
        </div>

        <BrowsingHistoryRail className="mt-10" />
      </div>

      <SiteFooter className="mt-4" />

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

/* ------------------------------------------------------------------------- */

/**
 * Which slide the hero is on, and when it moves.
 *
 * A chain of timeouts rather than one interval, so that a manual jump to a
 * slide restarts the full twelve seconds instead of inheriting whatever was
 * left of the previous tick — clicking a dot and having the slide change again
 * half a second later reads as a bug.
 *
 * It stops in three situations, all of them the same idea: nobody is watching,
 * so nobody's advert should be spent.
 *   - the pointer or the keyboard focus is inside the hero (they are reading it)
 *   - the tab is in the background
 *   - the reader asked the system for reduced motion, in which case the hero
 *     never moves on its own at all and the dots are the only way through
 */
function useHeroRotation(count: number) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [tabHidden, setTabHidden] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "hidden",
  );
  const reducedMotion = usePrefersReducedMotion();

  // An advert can end mid-session and the list comes back shorter, so the index
  // is clamped on read rather than trusted. Modulo, not min: it keeps the
  // rotation continuous instead of parking on the last slide forever.
  const safeIndex = count > 0 ? index % count : 0;

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const paused = held || tabHidden || reducedMotion;

  useEffect(() => {
    if (count < 2 || paused) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => window.clearTimeout(id);
  }, [count, paused, safeIndex]);

  return {
    index: safeIndex,
    paused,
    go: (i: number) => setIndex(i),
    // Wrapping in both directions, so the arrows never dead-end: the shopper on
    // the last slide who wants the first one presses next once, rather than
    // pressing back seven times or finding the control disabled.
    next: () => setIndex((i) => (count > 0 ? (i + 1) % count : 0)),
    prev: () => setIndex((i) => (count > 0 ? (i - 1 + count) % count : 0)),
    hold: () => setHeld(true),
    release: () => setHeld(false),
  };
}

/** Below this many pixels a horizontal drag is a tap with a shaky thumb. */
const SWIPE_PX = 48;

/**
 * Swipe-to-advance for the hero.
 *
 * Pointer events rather than touch events, so a trackpad drag and a finger are
 * the same gesture and there is one code path to reason about.
 *
 * The click suppression is the load-bearing part. Every slide is wrapped in
 * links, and a swipe that lifts over one would otherwise fire its click and
 * navigate to the product the shopper was trying to swipe away from. So a drag
 * past the threshold arms a flag that the capture-phase click handler consumes
 * before the link ever sees the event.
 *
 * `touch-action: pan-y` gives the browser the vertical axis and keeps the
 * horizontal for us, so the page still scrolls normally through the hero.
 */
function useSwipe({ onNext, onPrev }: { onNext: () => void; onPrev: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  return {
    style: { touchAction: "pan-y" as const },
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
      swiped.current = false;
    },
    onPointerUp: (e: React.PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      // Dominantly horizontal, or it was a scroll that happened to drift.
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
      swiped.current = true;
      if (dx < 0) onNext();
      else onPrev();
    },
    onPointerCancel: () => {
      start.current = null;
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!swiped.current) return;
      swiped.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

/** Whether the reader has asked the system for less movement. Live, because it
 *  is a setting people change while a page is open. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * The bought slot at the top of the marketplace, as a rotation.
 *
 * LABELLED, always. Every slide says "Promoted", and the panel says so again in
 * its accessible name. That is not a legal checkbox: the whole reason the free
 * rotation elsewhere on the page works is that shoppers can tell the two apart,
 * and a paid slide that looks identical to an earned one devalues both.
 *
 * WITH NOTHING BOOKED IT DOES NOT QUIETLY FILL WITH FREE CONTENT. It runs the
 * platform's own copy instead — see HouseSlide. Borrowing the free rotation
 * here would put unpaid products under a Promoted badge or, worse, teach
 * shoppers that the badge is decoration.
 *
 * The category rail lives inside this panel rather than above the grid because
 * it is the same kind of control as the hero: a way in, not a way to narrow
 * something you are already looking at. Picking one still drives the same
 * `category` filter the sidebar does.
 */
function PromotedHero({
  items,
  loading,
  fallbackImages,
  categories,
  category,
  onCategory,
  className,
}: {
  items: BannerProduct[];
  loading: boolean;
  /** Shown beside the house copy when nothing is booked, so the panel is not a
   *  wall of text on the one day the platform has sold nothing. */
  fallbackImages: Product[];
  categories: string[];
  category: string;
  onCategory: (c: string) => void;
  className?: string;
}) {
  const { index, paused, go, next, prev, hold, release } = useHeroRotation(items.length);
  const swipe = useSwipe({ onNext: next, onPrev: prev });
  const current = items[index];
  const navigable = items.length > 1;

  return (
    <section
      aria-label="Promoted products"
      aria-roledescription="carousel"
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocusCapture={hold}
      onBlurCapture={release}
      {...(navigable ? swipe : {})}
      className={cn(
        "hero-ink relative flex flex-col overflow-hidden rounded-bento p-5 sm:p-6 lg:min-h-104 lg:p-8",
        className,
      )}
    >
      {navigable && (
        <>
          <HeroArrow side="left" onClick={prev} />
          <HeroArrow side="right" onClick={next} />
        </>
      )}
      {/* Centred rather than top-aligned: the panel's height is set by whichever
          bento column is tallest, not by this content, so anchoring the slide to
          the top leaves a hole above the category rail on most screens.

          The horizontal padding is the arrows' gutter, and only exists when
          there are arrows. Without it they land on the vertical centre of the
          slide, which is exactly where the CTA button sits — the one control on
          the panel that must never be covered. */}
      <div className={cn("flex flex-1 items-center", navigable && "px-8 sm:px-9")}>
        {loading ? (
          <HeroSkeleton />
        ) : current ? (
          // Keyed on the index so React mounts a fresh subtree per rotation and
          // the entry animation replays without any transition bookkeeping.
          <HeroSlide key={index} product={current} />
        ) : (
          <HouseSlide images={fallbackImages} />
        )}
      </div>

      {items.length > 1 && (
        <div className="mt-6 flex items-center gap-2">
          {items.map((item, i) => (
            <button
              key={item.placementId}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show promoted product ${i + 1} of ${items.length}`}
              aria-current={i === index}
              className="group flex h-8 items-center focus-visible:outline-none"
            >
              <span
                className={cn(
                  "block h-1.5 overflow-hidden rounded-full bg-white/25 transition-all duration-300 group-focus-visible:ring-2 group-focus-visible:ring-white/70",
                  i === index ? "w-11" : "w-3.5 group-hover:bg-white/50",
                )}
              >
                {i === index && (
                  // Fills over exactly one dwell, so the shopper can see the
                  // slide is about to move rather than being surprised by it.
                  <span
                    className="animate-dot-progress block size-full rounded-full bg-white"
                    style={{
                      animationDuration: `${ROTATE_MS}ms`,
                      animationPlayState: paused ? "paused" : "running",
                    }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <CategoryRail categories={categories} value={category} onChange={onCategory} />
    </section>
  );
}

/**
 * Step the rotation by hand.
 *
 * Deliberately faint — bg-white/10 over the ink, lifting to /25 on hover. These
 * sit ON the advertiser's photograph, and a solid button there is furniture
 * taking up space somebody paid for. They are still real buttons: 40px, always
 * present rather than hover-only (a touch device has no hover, and controls
 * that appear only on desktop are controls half the traffic never learns
 * about), and named for screen readers.
 */
function HeroArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous promoted product" : "Next promoted product"}
      className={cn(
        "absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
        side === "left" ? "left-1 sm:left-2" : "right-1 sm:right-2",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}

/** One promoted product, at poster size. */
function HeroSlide({ product }: { product: BannerProduct }) {
  const from = minVariantPrice(product);
  const ranged = hasPriceRange(product);

  return (
    <div className="animate-hero-slide grid gap-5 sm:grid-cols-[1.1fr_0.9fr] sm:items-center sm:gap-6">
      <div className="min-w-0 order-2 sm:order-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-warning">
          <Megaphone className="size-3.5" aria-hidden />
          Promoted
        </span>

        {/* The headline is the copy the seller paid for; without one the
            product's own name does the job, which is why null is a perfectly
            ordinary value here rather than missing data. */}
        <p className="mt-3 line-clamp-3 text-[1.6rem] font-extrabold leading-[1.08] tracking-tight sm:text-[2rem] lg:text-[2.5rem]">
          {product.headline?.trim() || product.name}
        </p>

        {/* Only when the headline is the seller's own copy — repeating the
            product name under itself is noise. */}
        {product.headline?.trim() && (
          <p className="mt-2 line-clamp-1 text-sm" style={{ color: "var(--hero-fg-dim)" }}>
            {product.name}
          </p>
        )}

        <p className="mt-3 flex items-baseline gap-1.5">
          {ranged && (
            <span className="text-sm" style={{ color: "var(--hero-fg-dim)" }}>
              from
            </span>
          )}
          <span className="text-xl font-extrabold sm:text-2xl">{formatKes(from)}</span>
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            to={productHref(product)}
            className="group inline-flex items-center gap-2 rounded-full bg-primary py-1.5 pl-5 pr-1.5 text-sm font-bold text-on-accent transition-colors hover:bg-primary-deep"
          >
            Shop this
            <span className="flex size-8 items-center justify-center rounded-full bg-black/20 transition-transform group-hover:rotate-45">
              <ArrowUpRight className="size-4" aria-hidden />
            </span>
          </Link>
          {product.shopSlug && product.shopName && (
            <Link
              to={`/${product.shopSlug}`}
              className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold transition-colors hover:bg-white/20"
            >
              <Store className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{product.shopName}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="order-1 sm:order-2">
        <Link to={productHref(product)} tabIndex={-1} aria-hidden className="block">
          {/* Letterboxed on a phone, square from sm up. A square photo across
              the full width of a 430px screen is 390px of picture before the
              headline even starts, which pushes the price and the button off
              the first screenful — the two things the advertiser is paying to
              have seen. */}
          <ProductImage
            src={product.images[0]}
            alt={product.imageAlts?.[0]?.trim() || product.name}
            className="aspect-16/10 w-full rounded-[20px] object-cover shadow-float ring-1 ring-white/10 sm:aspect-square"
          />
        </Link>
      </div>
    </div>
  );
}

/**
 * What the hero says when nobody has bought it.
 *
 * The platform's own pitch, not borrowed inventory. An unsold advert slot is
 * the one piece of space a marketplace can honestly talk about itself in, and
 * filling it with free products under the same treatment paid ones get is how
 * the Promoted label stops meaning anything.
 */
function HouseSlide({ images }: { images: Product[] }) {
  const tiles = images.slice(0, 4);

  return (
    <div className="animate-hero-slide grid gap-5 sm:grid-cols-[1.1fr_0.9fr] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
          <Sparkles className="size-3.5" aria-hidden />
          PulseShop
        </span>
        <p className="mt-3 text-[1.6rem] font-extrabold leading-[1.08] tracking-tight sm:text-[2rem] lg:text-[2.5rem]">
          Every shop, one search box.
        </p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed" style={{ color: "var(--hero-fg-dim)" }}>
          Browse independent Kenyan shops side by side, follow the ones you like, and check out
          without leaving the page.
        </p>
        <Link
          to="/shops"
          className="group mt-5 inline-flex items-center gap-2 rounded-full bg-primary py-1.5 pl-5 pr-1.5 text-sm font-bold text-on-accent transition-colors hover:bg-primary-deep"
        >
          Explore the shops
          <span className="flex size-8 items-center justify-center rounded-full bg-black/20 transition-transform group-hover:rotate-45">
            <ArrowUpRight className="size-4" aria-hidden />
          </span>
        </Link>
      </div>

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2" aria-hidden>
          {tiles.map((p) => (
            <ProductImage
              key={p.id}
              src={p.images[0]}
              alt=""
              loading="lazy"
              className="aspect-square w-full rounded-2xl object-cover ring-1 ring-white/10"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-[1.1fr_0.9fr] sm:items-center sm:gap-6">
      <div className="space-y-3">
        <Skeleton className="h-6 w-28 rounded-full bg-white/10" />
        <Skeleton className="h-10 w-full bg-white/10" />
        <Skeleton className="h-10 w-2/3 bg-white/10" />
        <Skeleton className="h-11 w-40 rounded-full bg-white/10" />
      </div>
      <Skeleton className="aspect-square w-full rounded-[20px] bg-white/10" />
    </div>
  );
}

/**
 * The way in by category, drawn on the hero.
 *
 * Icons because this is a rail of eight-odd chips that has to be readable at a
 * glance in peripheral vision; the icon is what makes "Footwear" findable
 * without reading every label. Unknown categories fall back to a parcel, which
 * is honest — sellers name their own categories and the map cannot be complete.
 */
function CategoryRail({
  categories,
  value,
  onChange,
}: {
  categories: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  if (categories.length <= 1) return null;

  return (
    <div
      className="no-scrollbar -mx-5 mt-6 flex gap-2 overflow-x-auto px-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      {categories.map((cat) => {
        const Icon = categoryIcon(cat);
        const active = cat === value;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            aria-pressed={active}
            className={cn(
              "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors",
              active
                ? "bg-white text-[#12100f]"
                : "bg-white/10 text-(--hero-fg) hover:bg-white/20",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {cat}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A picture for a category name.
 *
 * Keyword matching rather than an exact table, because sellers type their own
 * categories: "Headphones", "Audio Equipment" and "Audio gear" are three
 * strings and one icon. Ordered longest-idea-first so "gaming console" is not
 * caught by the bare "phone" inside it.
 */
const CATEGORY_ICONS: [RegExp, LucideIcon][] = [
  [/head\s*phone|earbud|earphone/i, Headphones],
  [/console|gaming|game/i, Gamepad2],
  [/audio|speaker|sound|music/i, Music4],
  [/shoe|footwear|sneaker|boot|sandal/i, Footprints],
  [/jewel|jewellery|jewelry|ring|necklace|gold/i, Gem],
  [/watch|timepiece/i, Watch],
  [/phone|mobile|smart\s*device|tablet/i, Smartphone],
  [/laptop|computer|pc\b|notebook/i, Laptop],
  [/tv|television|monitor|screen/i, Tv],
  [/camera|photo|lens/i, Camera],
  [/cloth|apparel|fashion|shirt|dress|wear/i, Shirt],
  [/beauty|cosmetic|skin|hair|fragrance|perfume/i, SprayCan],
  [/furniture|home|decor|kitchen|living/i, Sofa],
  [/food|grocer|snack|drink|beverage/i, Utensils],
  [/sport|fitness|gym|outdoor/i, Dumbbell],
  [/book|stationery|station/i, BookOpen],
  [/baby|kid|child|toy/i, Baby],
  [/pet|dog|cat/i, PawPrint],
];

function categoryIcon(name: string): LucideIcon {
  if (name === "All") return Sparkles;
  return CATEGORY_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? Package;
}

/**
 * The free rotation, as a collage.
 *
 * The lead product gets the wide tile and the next two share the row under it,
 * which is the arrangement that says "here is a place to look" rather than
 * "here are three ranked results" — and ranking would be wrong, because nothing
 * in this panel was bought and the order is whatever the hourly rotation
 * handed back.
 */
function ShopCollageCard({
  items,
  loading,
  className,
}: {
  items: Product[];
  loading: boolean;
  className?: string;
}) {
  const [lead, ...rest] = items;

  return (
    <section
      className={cn("flex flex-col rounded-bento bg-card p-4 shadow-soft", className)}
      aria-label="A product from each shop"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-bold leading-snug text-ink">
          Curated shop
          <br className="hidden lg:inline" /> collections
        </h2>
        <Link to="/shops" className="shrink-0 text-xs font-semibold text-primary hover:underline">
          See all
        </Link>
      </div>

      {loading ? (
        <div className="mt-3 grid flex-1 grid-cols-3 grid-rows-[minmax(7rem,1fr)_auto] gap-2">
          <Skeleton className="col-span-3 size-full rounded-2xl" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-2xl" />
          ))}
        </div>
      ) : !lead ? (
        <p className="mt-3 flex-1 text-xs leading-relaxed text-muted">
          No shop has listed a product yet. This panel fills itself from the hourly rotation the
          moment one does.
        </p>
      ) : (
        <>
          {/* One wide tile over a row of three. The lead is not a ranking — the
              hourly rotation decides the order and nothing here was bought — it
              is just the shape that reads as a place to look rather than as a
              list of results. */}
          {/* The lead tile absorbs whatever height the bento row has spare
              (1fr), the three under it stay square. The alternative — fixing
              every tile's aspect ratio — leaves the card with a dead strip at
              the bottom on any screen where another column is taller, which is
              most of them. */}
          <div className="mt-3 grid flex-1 grid-cols-3 grid-rows-[minmax(7rem,1fr)_auto] gap-2">
            <Link
              to={productHref(lead)}
              className="group col-span-3 overflow-hidden rounded-2xl bg-fill"
            >
              <ProductImage
                src={lead.images[0]}
                alt={lead.imageAlts?.[0]?.trim() || lead.name}
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              />
            </Link>
            {rest.map((p) => (
              <Link
                key={p.id}
                to={productHref(p)}
                className="group overflow-hidden rounded-2xl bg-fill"
              >
                <ProductImage
                  src={p.images[0]}
                  alt={p.imageAlts?.[0]?.trim() || p.name}
                  loading="lazy"
                  className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                />
              </Link>
            ))}
          </div>

          <div className="mt-3">
            <Link
              to={lead.shopSlug ? `/${lead.shopSlug}` : "/shops"}
              className="truncate text-sm font-extrabold text-ink hover:underline"
            >
              {lead.shopName ?? lead.name}
            </Link>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              One product from every shop on PulseShop, rotated hourly. Nobody pays for this.
            </p>
          </div>
        </>
      )}
    </section>
  );
}


/**
 * Recommended for you, built from the last thing they opened.
 *
 * REPLACES THE COLOUR SWATCHES that used to sit here. Those were a filter
 * wearing a panel's clothes: they did the same job as the colour section of the
 * filter sidebar, three inches away, and gave the most valuable strip of the
 * page over to restating a control rather than to showing merchandise.
 *
 * What goes there instead is the one thing this page knew about the shopper and
 * was not using — which product they last opened (stores/browsingHistory.ts).
 * The card shows what is LIKE that, not the product itself: recommending
 * something they were just looking at is the shape of a recommendation without
 * the substance.
 *
 * Renders nothing on a first visit. A recommendations panel with nothing behind
 * it would have to be filled with something arbitrary and called a
 * recommendation, which is worse than an honest absence — and the column below
 * simply moves up.
 */
function RecommendationsCard() {
  const viewed = useBrowsingHistory((s) => s.viewed);
  const seed = lastViewed(viewed);

  const relatedQ = useQuery({
    queryKey: ["recommended", seed?.category],
    queryFn: () => services.products.searchProducts({ category: seed!.category, pageSize: 6 }),
    enabled: Boolean(seed?.category),
  });

  // Everything they have already seen is filtered out, not just the seed: a
  // "recommendation" the shopper has opened twice this session is a reminder,
  // and they have the browsing-history rail for those.
  const seenIds = new Set(viewed.map((v) => v.id));
  const picks = (relatedQ.data?.items ?? []).filter((p) => !seenIds.has(p.id)).slice(0, 4);

  if (!seed) return null;

  return (
    <section className="rounded-bento bg-card p-4 shadow-soft" aria-label="Recommended for you">
      <h2 className="text-sm font-bold text-ink">Recommended for you</h2>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted">
        Because you viewed <span className="font-semibold text-ink">{seed.name}</span>
      </p>

      {relatedQ.isLoading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-12 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : picks.length === 0 ? (
        // The seed is still worth a link even when nothing new sits beside it —
        // "take me back to what I was looking at" is a real thing to want.
        <ViewedSeedLink seed={seed} />
      ) : (
        <ul className="mt-3 space-y-1">
          {picks.map((p) => (
            <li key={p.id}>
              <Link
                to={productHref(p)}
                className="flex items-center gap-2 rounded-btn p-1 transition-colors hover:bg-fill"
              >
                <ProductImage
                  src={p.images[0]}
                  alt=""
                  loading="lazy"
                  className="size-10 shrink-0 rounded-lg object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-ink">{p.name}</span>
                  <span className="block text-xs font-extrabold text-primary">
                    {formatKes(minVariantPrice(p))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ViewedSeedLink({ seed }: { seed: ViewedProduct }) {
  return (
    <Link
      to={seed.shopSlug && seed.slug ? `/${seed.shopSlug}/${seed.slug}` : `/product/${seed.id}`}
      className="mt-3 flex items-center gap-2 rounded-btn p-1 transition-colors hover:bg-fill"
    >
      <ProductImage
        src={seed.image}
        alt=""
        loading="lazy"
        className="size-10 shrink-0 rounded-lg object-cover"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-ink">{seed.name}</span>
        <span className="block text-xs font-extrabold text-primary">
          {formatKes(seed.priceKes)}
        </span>
      </span>
    </Link>
  );
}

/**
 * Shops to explore.
 *
 * The social half of the front page: a shopper who likes what they see should
 * be able to go to the seller, not just the SKU.
 */
function ShopsCard({ shops, loading }: { shops: Merchant[]; loading: boolean }) {
  return (
    <section className="rounded-bento bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">Explore shops</h2>
        <Link to="/shops" className="text-xs font-semibold text-primary hover:underline">
          See all
        </Link>
      </div>
      <div className="mt-3 space-y-1">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className="h-3.5 w-24 rounded" />
              </div>
            ))
          : shops.slice(0, 5).map((shop) => (
              <Link
                key={shop.id}
                to={`/${shop.handle}`}
                className="flex items-center gap-2 rounded-btn py-1.5 pr-1 transition-colors hover:bg-fill"
              >
                {shop.avatarUrl ? (
                  <img
                    src={shop.avatarUrl}
                    alt=""
                    className="size-8 shrink-0 rounded-full object-cover ring-1 ring-line-soft"
                  />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Store className="size-3.5 text-primary" />
                  </span>
                )}
                <span className="min-w-0 truncate text-sm font-semibold text-ink">{shop.name}</span>
              </Link>
            ))}
      </div>
    </section>
  );
}

/**
 * The same shops as ShopsCard, laid out for a phone.
 *
 * Two components rather than one responsive one because the two layouts share
 * no structure: the card is a vertical list of rows inside a bento panel, this
 * is a horizontally scrolling rail of avatar-over-name tiles. Trying to express
 * both as one component means a wrapper full of `lg:` reversals around every
 * element, which is harder to read than the two plain versions and reliably
 * produces a layout that is wrong at one width or the other.
 *
 * It shows more shops than the desktop card does (eight against five) because
 * a rail is not competing for vertical space with anything — scrolling
 * sideways costs the page nothing, where a sixth row in the bento column would
 * push the whole right-hand stack taller.
 */
function ShopsRail({
  shops,
  loading,
  className,
}: {
  shops: Merchant[];
  loading: boolean;
  className?: string;
}) {
  if (!loading && shops.length === 0) return null;

  return (
    <section aria-label="Shops on PulseShop" className={className}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Store className="size-4 text-primary" aria-hidden />
          Explore shops
        </h2>
        <Link to="/shops" className="text-xs font-semibold text-primary hover:underline">
          See all
        </Link>
      </div>

      {/* Bleeds to the screen edges so the last tile is visibly cut off rather
          than ending flush with the margin — the cue that tells a thumb there
          is more to the right. */}
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <Skeleton className="size-14 rounded-full" />
                <Skeleton className="h-3 w-12 rounded" />
              </div>
            ))
          : shops.slice(0, 8).map((shop) => (
              <Link
                key={shop.id}
                to={`/${shop.handle}`}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center"
              >
                {shop.avatarUrl ? (
                  <img
                    src={shop.avatarUrl}
                    alt=""
                    loading="lazy"
                    className="size-14 rounded-full object-cover ring-1 ring-line-soft"
                  />
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-full bg-primary/10">
                    <Store className="size-5 text-primary" aria-hidden />
                  </span>
                )}
                <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-ink">
                  {shop.name}
                </span>
              </Link>
            ))}
      </div>
    </section>
  );
}

/**
 * The wishlist, as a phone-sized control in the masthead.
 *
 * Not a duplicate of the Favorites tab so much as a shortcut to it from where
 * the thumb already is. The tab bar is the permanent home for the destination;
 * this is the one that stays reachable while the shopper is head-down in the
 * category wall, and it carries the count so "did that save?" is answerable
 * without navigating.
 *
 * Deliberately NOT wired through DesktopQuickNav: that component's icon row is
 * lg-only by design, and forcing it to render one of its four icons on a phone
 * would make it two components pretending to be one.
 */
function WishlistButton() {
  const count = useFavorites((s) => s.favorites.length);

  return (
    <NavLink
      to="/favorites"
      aria-label={count > 0 ? `Wishlist, ${count} saved` : "Wishlist"}
      className={({ isActive }) =>
        cn(
          "relative flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          isActive ? "border-primary/40 bg-primary/10 text-primary" : "border-line bg-card text-ink",
        )
      }
    >
      <Heart className="size-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-favorite px-1 text-[10px] font-bold text-white ring-2 ring-card">
          {count}
        </span>
      )}
    </NavLink>
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
        className="h-11 w-full rounded-full border border-line bg-card pl-9 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:appearance-none"
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
 * The rest of the free rotation, under the bento.
 *
 * Nothing here is bought: the database picks one product per registered shop
 * and rotates the selection hourly, so a shop that opened this morning sits
 * beside the busiest one on the platform. The first three lead the collage
 * panel above; this rail carries whichever shops that panel had no room for,
 * which is why it is a scrolling rail at every width rather than a grid of
 * three — the count depends on how many shops exist, and a grid that leaves one
 * card alone on a second row is worse than a rail.
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
      <div className={cn("no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 lg:-mx-6 lg:px-6", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-64 shrink-0 rounded-card" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <section aria-label="More from the shops on PulseShop" className={className}>
      <div className="mb-2.5 flex items-center gap-1.5">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-bold text-ink">More from the shops on PulseShop</h2>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 lg:-mx-6 lg:px-6">
        {items.map((p) => (
          <Link
            key={p.id}
            to={productHref(p)}
            className="group relative w-64 shrink-0 overflow-hidden rounded-card bg-card shadow-soft transition-shadow hover:shadow-md"
          >
            <div className="flex h-36">
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
