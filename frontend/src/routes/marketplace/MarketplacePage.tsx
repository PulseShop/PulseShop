import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Baby,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
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
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Sofa,
  Sparkles,
  SprayCan,
  Store,
  Tag,
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
import type { CuratedTile } from "@/components/product/CategoryWall";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductImage } from "@/components/product/ProductImage";
import { PriceRangeFilter } from "@/components/product/PriceRangeFilter";
import { QueryError } from "@/components/common/QueryError";
import { Sheet } from "@/components/ui/Modal";
import { RailArrow, useRailScroll } from "@/components/ui/RailArrow";
import { ProductCardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import { useProductAdd } from "@/hooks/useProductAdd";
import { useSeo } from "@/hooks/useSeo";
import { colorHex, groupLabel, sortSizes } from "@/lib/constants";
import { ALL_GROUPS, useCategoryFilter } from "@/hooks/useCategoryFilter";
import { HERO_SLOTS } from "@/lib/placements";
import { formatKes, hasPriceRange, minVariantPrice } from "@/lib/currency";
import { productHref } from "@/lib/productUrl";
import { homeSeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import { lastViewed, useBrowsingHistory } from "@/stores/browsingHistory";
import { cartCount, useCart } from "@/stores/cart";
import { useFavorites } from "@/stores/favorites";
import type { ViewedProduct } from "@/stores/browsingHistory";
import type { BannerProduct, Merchant, Product } from "@/types";

type SortOrder = "newest" | "price-asc" | "price-desc";

const PAGE_SIZE = 12;
/**
 * The catalogue grid.
 *
 * FIVE COLUMNS AT xl, NOT FOUR. The filter sidebar used to take a 13-rem column
 * out of the left of this section, so the grid was drawing four tiles in the
 * space of five and every product on the page was a little smaller than it
 * needed to be. The filters are a rail above the grid now — the same rail a
 * phone gets — and the column they vacated goes back to merchandise.
 */
const GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
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

  // Explicit null = every shop. OMITTING the argument means "the signed-in
  // merchant's own catalogue", which is what this used to pass by accident: the
  // front page asked for one shop's facets, and for a guest, who has no id, the
  // call threw outright and the whole filter panel rendered empty.
  //
  // It sits up here, above the filter derivations, because the category ribbon
  // is now built FROM it: which generals exist at all is a fact about what is
  // in stock, not about the taxonomy. See useCategoryFilter.
  const facetsQ = useQuery({
    queryKey: ["marketplace-facets"],
    queryFn: () => services.products.getFacets(null),
  });
  const categories = facetsQ.data?.categories ?? [];
  /** General -> specific, shared with the storefront. See useCategoryFilter. */
  const cat = useCategoryFilter(categories);

  const activeFilterCount =
    sizes.length +
    colors.length +
    (availableOnly ? 1 : 0) +
    // The band counts as ONE filter however many ends are set: "3,000 to 5,000"
    // is one decision the shopper made, and badging it as two overstates how
    // much is switched on.
    (minPrice !== null || maxPrice !== null ? 1 : 0) +
    (minRating !== null ? 1 : 0) +
    // The general counts as one and each specific as one more, so the badge
    // matches the chips: "Beauty & Health + Hair Care" reads as two decisions
    // because the shopper made two.
    cat.activeCount;

  const clearFilters = () => {
    setSizes([]);
    setColors([]);
    setAvailableOnly(false);
    setMinPrice(null);
    setMaxPrice(null);
    setMinRating(null);
    cat.reset();
  };

  const appliedFilters: { key: string; label: string; remove: () => void }[] = [
    // The general first, then the specifics under it — the order they were
    // chosen in, and the order they read in. Removing the general removes its
    // specifics with it (cat.setGroup clears them), which is the only coherent
    // meaning: "Hair Care" with no group above it is not a state the ribbon has.
    ...(cat.group !== ALL_GROUPS
      ? [
          {
            key: "cat",
            label: groupLabel(cat.group),
            remove: () => cat.setGroup(ALL_GROUPS),
          },
        ]
      : []),
    ...cat.subs.map((c) => ({
      key: `sub:${c}`,
      label: c,
      remove: () => cat.toggleSub(c),
    })),
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
    // A flat list of leaves; the group level never reaches the RPC. Undefined
    // when nothing is picked, so an unfiltered grid sends no category argument
    // at all. See useCategoryFilter and migration 0059.
    categories: cat.queryCategories,
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
    queryFn: () => services.follows.listShops({ pageSize: 12 }),
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

  /**
   * Everything currently marked down (migration 0058).
   *
   * Its own query for the same reason as the three above: a failure here must
   * degrade to a missing shelf, not to an error screen over the categories and
   * the catalogue. DealsShelf renders nothing when this comes back empty, so a
   * platform with no discounts on today simply has one fewer section rather
   * than an empty heading promising deals.
   */
  const dealsQ = useQuery({
    queryKey: ["deals-of-the-day"],
    queryFn: () => services.products.listDeals(),
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

  /**
   * The free rotation, as four pictures for the curated card in the category
   * wall (see CategoryWall's `curated` prop for why it moved there).
   *
   * Four, not three, because four is how many shops a young platform has: at
   * three the card left a hole in its two-by-two grid, which reads as a
   * rendering fault rather than as a small marketplace.
   */
  const curatedTiles: CuratedTile[] = features.slice(0, 4).map((p) => ({
    id: p.id,
    image: p.images[0],
    imageAlt: p.imageAlts?.[0]?.trim() || undefined,
    href: productHref(p),
    name: p.name,
    // The same figure a product card would quote — the cheapest reachable
    // variant, flagged as a floor when there is a range behind it.
    price: minVariantPrice(p),
    ranged: hasPriceRange(p),
  }));

  /**
   * How the bought inventory splits between the two paid panels.
   *
   * The hero is the premium unit and keeps the front of the rotation; whatever
   * does not fit becomes the sponsored panel beside it, visible at a glance
   * rather than eventually. See HERO_SLOTS for why the cut is where it is.
   *
   * Every live placement therefore still reaches the front page, and reaches it
   * in exactly one of the two units.
   */
  const placements = placementsQ.data ?? [];
  const heroPlacements = placements.slice(0, HERO_SLOTS);
  const sponsoredPlacements = placements.slice(HERO_SLOTS);

  const filterControls = (
    <>
      {/* The same two levels the ribbon draws, as a list. The sheet holds every
          filter there is, so a shopper who opens it must be able to reach the
          same selection they could reach from the chips — a flat list here and
          a tree out there would be two answers to one question. */}
      <div>
        <h2 className="text-sm font-bold text-ink">Category</h2>
        <ul className="mt-3 space-y-1">
          <li>
            <button
              type="button"
              onClick={() => cat.setGroup(ALL_GROUPS)}
              className={cn(
                "w-full rounded-btn px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
                cat.group === ALL_GROUPS
                  ? "bg-primary/10 text-primary"
                  : "text-muted hover:text-ink",
              )}
            >
              All
            </button>
          </li>
          {cat.tree.map((g) => {
            const open = cat.group === g.group;
            return (
              <li key={g.group}>
                <button
                  type="button"
                  onClick={() => cat.setGroup(open ? ALL_GROUPS : g.group)}
                  aria-expanded={open}
                  className={cn(
                    "flex w-full items-center justify-between rounded-btn px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
                    open ? "bg-primary/10 text-primary" : "text-muted hover:text-ink",
                  )}
                >
                  {g.label}
                  <ChevronDown
                    className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {/* Only under the open general: a full tree of every leaf on the
                    platform is a wall, and the second level only means anything
                    once the first has been chosen. */}
                {open && (
                  <ul className="mb-1 ml-2.5 mt-1 space-y-0.5 border-l border-line pl-2.5">
                    {g.items.map((leaf) => {
                      const on = cat.subs.includes(leaf);
                      return (
                        <li key={leaf}>
                          <button
                            type="button"
                            onClick={() => cat.toggleSub(leaf)}
                            aria-pressed={on}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm transition-colors",
                              on ? "font-semibold text-ink" : "text-muted hover:text-ink",
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded border",
                                on ? "border-primary bg-primary text-on-accent" : "border-line",
                              )}
                            >
                              {on && <Check className="size-3" />}
                            </span>
                            {leaf}
                          </button>
                        </li>
                      );
                    })}
                    {/* Says what an empty selection MEANS. Without it, no ticks
                        looks like nothing is filtered, when in fact the whole
                        general is. */}
                    {cat.subs.length === 0 && (
                      <li className="px-2 py-1 text-xs text-muted">Showing all of {g.label}</li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
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
        THE MASTHEAD, ON ONE LINE AT EVERY WIDTH.

        It used to be two rows on a phone: logo and account avatar on top, then
        search, wishlist and cart underneath. The top row was the weak one —
        a 32px logo and a 40px avatar spending a whole line of the narrowest
        screen on this site, and the avatar is the Account tab from the bar
        three inches below, reached by a control that has no badge, no count and
        nothing to say that the tab does not.

        So the avatar goes (DesktopQuickNav is dropped below lg here, and only
        here) and the second row moves up into the space it left. The logo and
        the search field each come down a size to pay for the move, which is the
        trade this makes: a slightly shorter search field, and a masthead that
        is one storey tall instead of two.

        WISHLIST AND CART STAY. They are tabs in the bottom bar as well, but
        they are the only controls on the page carrying a number that changes as
        the shopper works — "did that save?" and "did that go in?" have to be
        answerable without navigating and without scrolling. Home and Shops are
        NOT here for exactly the opposite reason: they are destinations, the bar
        already holds them, and neither ever changes.

        Past lg there is no bottom bar (BottomNav is lg:hidden), so the full
        icon row and the account menu come back and these two hide instead —
        the same four destinations, drawn once, wherever they have to live.
      */}
      <header className="glass-header sticky top-0 z-30 px-4 py-2.5 lg:px-6 lg:py-3">
        <div className="flex items-center justify-between gap-2 lg:gap-3">
          {/* The wordmark is the first thing to go when the row runs out of
              room, and 440px is where the row runs out: below it the lettering
              costs more than the search field can spare, and the field stops
              being able to show its own placeholder. The mark alone is still
              the brand — it carries the wordmark inside the icon — so what is
              lost below 440px is a repetition, and what is bought is a search
              box that reads as one. */}
          <LogoLink
            size={28}
            wordmark
            wordmarkClassName="hidden min-[440px]:inline text-[15px] lg:text-lg"
          />

          <div className="min-w-0 flex-1 lg:max-w-md">
            <SearchField value={search} onChange={setSearch} />
          </div>

          <div className="flex items-center gap-1.5 lg:hidden">
            <WishlistButton />
            <CartButton />
          </div>

          {/* Home is a no-op on this page and still sits in this row: it is the
              same control in the same place on every buyer route, and one that
              disappears on the page it points at is one people stop looking
              for. It renders active here rather than being hidden. */}
          <DesktopQuickNav className="hidden lg:flex" />
        </div>
      </header>

      <div className="px-4 pb-6 pt-4 lg:px-6">
        {/* The page's one h1. It is off-screen because the visible headline is
            whichever product happens to be in the hero this second, and a
            document outline that changes every twelve seconds is no outline. */}
        <h1 className="sr-only">PulseShop marketplace — every shop in one place</h1>

        {/* THE PAID ROW, AS TWO UNITS RATHER THAN ONE.

            Past lg they sit side by side in twelve columns: the promoted hero
            takes seven because it is the only panel carrying a photograph at
            display size, and the sponsored panel takes the remaining five.

            ON A PHONE THEY STACK, AND SPONSORED GOES ON TOP. The sponsored
            panel used to be desktop-only, on the argument that one full-width
            advert is enough for a phone. What that actually did was hide the
            back half of the queue from most of the traffic — everything past
            HERO_SLOTS simply did not exist below lg. Two panels of unequal size
            is a better answer than one panel and a hole: the compact list
            leads, because it shows three placements in the height the hero
            spends on one, and the hero follows underneath at poster size.

            BOTH HALVES OF THIS ROW ARE PAID. The five columns on the right used
            to hold the free hourly rotation, which put the one unbuyable thing
            on the page inside the one row that is entirely advertising — the
            worst possible place to make the distinction legible. The rotation
            is a card in the category wall below now, where it says in as many
            words that nobody paid for it, and this row reads as what it is: the
            advertising strip, top of page, labelled twice.

            IT DISAPPEARS THE MOMENT SOMEBODY SEARCHES. A shopper who typed a
            query has told you exactly what they want, and making them scroll
            past two banners to reach it is the site arguing with them. */}
        {!isSearching && (
          <div className="grid gap-3 lg:grid-cols-12 lg:gap-4">
            {/* First in the DOM, so it is the panel a phone reads first and the
                one a screen reader reaches first. The order classes put it back
                on the right at lg, where reading order and column order stop
                being the same question. */}
            <SponsoredPanel
              className={cn(
                "lg:order-2 lg:col-span-5 lg:flex",
                // Nothing booked past the hero means nothing to show, and on a
                // phone the fallback pitch would be an advert for advertising
                // sitting above the fold. No skeleton either: on a platform
                // this young the tail is usually empty, so reserving three rows
                // of it would mean the common case is a placeholder that
                // collapses. Desktop keeps both the skeleton and the pitch —
                // the panel is a fixed column there, and an empty one is a
                // hole in the layout rather than a section that did not apply.
                sponsoredPlacements.length > 0 ? "flex" : "hidden",
              )}
              items={sponsoredPlacements}
              loading={placementsQ.isLoading}
            />

            <PromotedHero
              className="lg:order-1 lg:col-span-7"
              items={heroPlacements}
              loading={placementsQ.isLoading}
              fallbackImages={features.slice(0, 4)}
            />
          </div>
        )}

        {/* THE CATEGORIES. The main section of the page, and centred to say so.

            This is the front page's answer to the only question a first-time
            visitor actually has: what is sold here. The catalogue grid further
            down answers "find me this", which is a different question and a
            worse one to lead with on a young marketplace — an undifferentiated
            grid of everything is at its least useful precisely when there is
            not much of it.

            The free hourly rotation leads the wall as one more card. It is a
            way in, exactly like a category is, so it belongs among the ways in
            rather than in the paid row above.

            Hidden while searching for the same reason the banners are: a
            shopper who typed a query has already answered the question this
            section asks. */}
        {!isSearching && (
          <CategoryWall
            entries={showcaseQ.data ?? []}
            loading={showcaseQ.isLoading}
            curated={curatedTiles}
            curatedLoading={featuresQ.isLoading}
            className="mt-7 lg:mt-10"
          />
        )}

        {/* DEALS OF THE DAY. Every product on the platform that is marked down,
            biggest discount first — a whole-table query (migration 0058), not a
            filtered page, because a shelf that claims "every discount" and
            shows whichever ones fell inside the first twelve rows is lying.

            Directly under the categories because it is the other thing a
            shopper browses BY. Categories are "what kind of thing", deals are
            "what is cheap today", and neither of them needs a filter panel
            opened first. */}
        {!isSearching && (
          <DealsShelf items={dealsQ.data ?? []} loading={dealsQ.isLoading} className="mt-8 lg:mt-12" />
        )}

        {/* Who sells here. One row of avatars, kept between the two browsing
            shelves above and the catalogue below, because a shop is the third
            way into this page that is not a search box and it costs a single
            line to offer. */}
        {!isSearching && (
          <ShopsRail
            shops={shopsQ.data?.items ?? []}
            loading={shopsQ.isLoading}
            className="mt-8 lg:mt-10"
          />
        )}


        {/* Filters left, grid right — the storefront already put its filters on
            the left, and having them swap sides between the two browsing pages
            would be the kind of inconsistency nobody can name but everybody
            feels. The shops rail that used to sit on the right is now a bento
            card; two lists of the same shops on one screen was one too many. */}
        {/* THE CATALOGUE, DEMOTED BUT NOT DELETED.

            It used to start a few pixels under the banners and be the whole
            rest of the page. It is now the LAST browsing band, under the
            categories, the deals and the shops, because a flat grid of
            everything is the answer to "find me this" and the three sections
            above are the answer to "what is here" — and on a catalogue this
            size the second question is the one a visitor actually arrives
            with. It stays because nothing else on the page can show the whole
            catalogue at once, and because the sort control and the filter
            panel have nowhere else to live. */}
        {/* No top margin while searching: every band above this one is hidden
            then, so the gap would open directly under the masthead. */}
        <h2
          className={cn(
            "text-lg font-extrabold text-ink lg:text-2xl",
            !isSearching && "mt-10 lg:mt-14",
          )}
        >
          {isSearching ? "Search results" : "Everything on PulseShop"}
        </h2>

        {/* The categories and the filter sheet, on the line between the heading
            and the results they change — at every width now. See CategoryRail. */}
        <CategoryRail
          tree={cat.tree}
          group={cat.group}
          onGroupChange={cat.setGroup}
          groupLeaves={cat.groupLeaves}
          subs={cat.subs}
          onToggleSub={cat.toggleSub}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeFilterCount}
          className="mt-3"
        />

        <div className="mt-4">
          <section className="min-w-0 flex-1">
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

        {/* WHAT THE SHOPPER HAS DONE HERE, in one band at the foot of the page.
            The rail is where they have been and the card is what that implies
            they might want next, which is one thought, not two — they were
            three sections apart until now, with the recommendations stranded in
            a 14-rem column beside a rail of shop avatars.

            The card renders nothing at all before a first product is opened, so
            on a first visit this band is the history rail alone and the layout
            simply closes up around it (lg:empty:hidden). */}
        <div className="mt-10 lg:flex lg:items-start lg:gap-6">
          <BrowsingHistoryRail className="min-w-0 lg:flex-1" />
          <div className="mt-6 hidden shrink-0 lg:mt-0 lg:block lg:w-56 lg:empty:hidden">
            <RecommendationsCard />
          </div>
        </div>
      </div>

      <SiteFooter className="mt-4" />

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        {/* Capped and scrollable. This was always taller than a phone screen —
            a category list, sizes, colours, a price slider and ratings — and
            the top of it was simply cut off; now that the desktop sidebar is
            gone and this is the only way to reach any of it, an unreachable
            control is not a cosmetic problem. */}
        <div className="max-h-[60vh] space-y-6 overflow-y-auto overscroll-contain pr-1">
          {filterControls}
        </div>
        {/* Outside the scroller on purpose: it is the way out of this sheet,
            and a way out that has to be scrolled to is one people miss. */}
        <button
          type="button"
          onClick={() => setFiltersOpen(false)}
          className="mt-4 w-full rounded-btn bg-primary px-6 py-3 text-sm font-bold text-on-accent"
        >
          Show {totalMatches} {totalMatches === 1 ? "product" : "products"}
        </button>
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
  /**
   * A fourth reason to stop, and the only one that is not about attention: the
   * shopper is halfway through choosing a size in the slide's variant sheet.
   *
   * Deliberately NOT folded into `held`. Opening the sheet moves focus into a
   * portal outside this section, which fires the panel's own onBlurCapture and
   * would release the hold a moment after the sheet took it — the rotation
   * would then unmount the slide, and the sheet with it, mid-choice.
   */
  const [choosing, setChoosing] = useState(false);
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

  const paused = held || choosing || tabHidden || reducedMotion;

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
    setChoosing,
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
 * THE CATEGORY RAIL USED TO LIVE IN HERE, on the argument that it is the same
 * kind of control as the hero: a way in rather than a way to narrow. True, and
 * beside the point — the thing it changes is the grid at the very bottom of the
 * page, so tapping a category from up here filtered a section the shopper could
 * not see and left them scrolling past four bands to find out what happened.
 * It now sits directly above that grid. See CategoryRail.
 */
function PromotedHero({
  items,
  loading,
  fallbackImages,
  className,
}: {
  items: BannerProduct[];
  loading: boolean;
  /** Shown beside the house copy when nothing is booked, so the panel is not a
   *  wall of text on the one day the platform has sold nothing. */
  fallbackImages: Product[];
  className?: string;
}) {
  const { index, paused, go, next, prev, hold, release, setChoosing } = useHeroRotation(
    items.length,
  );
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
        // PHONE PADDING IS 16px, NOT 20px. The banner was taking most of a
        // phone screen before the catalogue started; every measurement on it
        // that only applies below sm has come down — the padding here, the
        // picture, the headline and the two gaps under the slide, and the arrow
        // gutter all the way to nothing (HeroArrow is sm and up). Nothing at sm
        // and above moved: the panel was never too big on a laptop, and
        // shrinking it there would just waste the seven columns it was given.
        "hero-ink relative flex flex-col overflow-hidden rounded-bento p-4 sm:p-6 lg:min-h-104 lg:p-8",
        className,
      )}
    >
      {navigable && (
        <>
          <HeroArrow side="left" onClick={prev} />
          <HeroArrow side="right" onClick={next} />
        </>
      )}
      {/* Centred rather than top-aligned: past lg the panel's height is set by
          whichever bento column is tallest rather than by this content, so
          anchoring the slide to the top would leave a hole under it.

          The horizontal padding is the arrows' gutter. It exists only where
          there are arrows to make room for — when there is one slide, and at
          all on a phone. Without it they land on the vertical centre of the
          slide, which is exactly where the add button sits: the one control on
          the panel that must never be covered. */}
      <div className={cn("flex flex-1 items-center", navigable && "sm:px-9")}>
        {loading ? (
          <HeroSkeleton />
        ) : current ? (
          // Keyed on the index so React mounts a fresh subtree per rotation and
          // the entry animation replays without any transition bookkeeping.
          <HeroSlide key={index} product={current} onChoosing={setChoosing} />
        ) : (
          <HouseSlide images={fallbackImages} />
        )}
      </div>

      {items.length > 1 && (
        <div className="mt-4 flex items-center gap-2 sm:mt-6">
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
        // Hidden on a phone. The slide is a 112px picture beside a 180px
        // column there, so a 40px control floating over its middle covers one
        // or the other; the swipe handler and the dots underneath are both
        // still live, and both are bigger targets than the arrows ever were.
        "absolute top-1/2 z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:flex",
        side === "left" ? "left-1 sm:left-2" : "right-1 sm:right-2",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}

/**
 * One promoted product.
 *
 * TWO ARRANGEMENTS OF THE SAME FIVE FACTS. On a phone the photograph sits on
 * the left at thumbnail size and everything else stacks to the right of it;
 * from sm up the copy leads and the picture takes the right-hand column at
 * poster size. The phone version used to be the desktop one with the picture
 * moved on top, which spent 390px of screen height on the image and pushed the
 * price and the buttons — the two things the advertiser is paying to have seen
 * — off the first screenful.
 *
 * THE PICTURE IS CONTAINED, NOT CROPPED, at thumbnail size. A square crop of a
 * 16:9 product shot is a close-up of the middle of a phone; at 112px that is
 * not a product, it is a texture. object-contain over a neutral plate shows the
 * whole thing the advert is for, which is the entire job of the image here.
 *
 * TWO BUTTONS, AND THEY ARE THE TWO REAL DESTINATIONS. "Add" puts it in the
 * cart from where the shopper already is (the variant sheet opens first when
 * there is a size or a colour to choose — see useProductAdd), and the shop chip
 * goes to the seller. The product page is reachable by the picture and the
 * headline, both of which are links, so the row underneath does not need to
 * spend a third button repeating them.
 */
function HeroSlide({
  product,
  onChoosing,
}: {
  product: BannerProduct;
  /** Stops the rotation while the variant sheet is open — the slide is keyed on
   *  the rotation index, so a tick here would unmount the sheet mid-choice. */
  onChoosing: (choosing: boolean) => void;
}) {
  const from = minVariantPrice(product);
  const ranged = hasPriceRange(product);
  const { addLabel, onAddClick, variantSheet, sheetOpen } = useProductAdd(product);
  const soldOut = product.status === "out";

  // The cleanup matters as much as the call: it hands the clock back when the
  // sheet closes AND when the slide is unmounted with the sheet still open.
  useEffect(() => {
    onChoosing(sheetOpen);
    return () => onChoosing(false);
  }, [sheetOpen, onChoosing]);

  return (
    <div className="animate-hero-slide grid w-full grid-cols-[7rem_1fr] items-center gap-3 sm:grid-cols-[1.1fr_0.9fr] sm:gap-6">
      <div className="min-w-0 order-2 sm:order-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning sm:px-2.5 sm:py-1 sm:text-[11px]">
          <Megaphone className="size-3 sm:size-3.5" aria-hidden />
          Promoted
        </span>

        {/* The headline is the copy the seller paid for; without one the
            product's own name does the job, which is why null is a perfectly
            ordinary value here rather than missing data. */}
        <Link to={productHref(product)} className="block">
          <p className="mt-1.5 line-clamp-2 text-base font-extrabold leading-[1.12] tracking-tight sm:mt-3 sm:line-clamp-3 sm:text-[2rem] sm:leading-[1.08] lg:text-[2.5rem]">
            {product.headline?.trim() || product.name}
          </p>
        </Link>

        {/* Only when the headline is the seller's own copy — repeating the
            product name under itself is noise. */}
        {product.headline?.trim() && (
          <p
            className="mt-1 line-clamp-1 text-xs sm:mt-2 sm:text-sm"
            style={{ color: "var(--hero-fg-dim)" }}
          >
            {product.name}
          </p>
        )}

        <p className="mt-1.5 flex items-baseline gap-1.5 sm:mt-3">
          {ranged && (
            <span className="text-xs sm:text-sm" style={{ color: "var(--hero-fg-dim)" }}>
              from
            </span>
          )}
          <span className="text-lg font-extrabold sm:text-2xl">{formatKes(from)}</span>
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:mt-5 sm:gap-3">
          {!soldOut && (
            <button
              type="button"
              onClick={onAddClick}
              aria-label={addLabel}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-bold text-on-accent transition-colors hover:bg-primary-deep sm:min-h-10 sm:px-5"
            >
              <ShoppingBag className="size-4 shrink-0" aria-hidden />
              Add
            </button>
          )}
          {product.shopSlug && product.shopName && (
            <Link
              to={`/${product.shopSlug}`}
              className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold transition-colors hover:bg-white/20 sm:min-h-10"
            >
              <Store className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{product.shopName}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="order-1 sm:order-2">
        <Link to={productHref(product)} tabIndex={-1} aria-hidden className="block">
          <ProductImage
            src={product.images[0]}
            alt={product.imageAlts?.[0]?.trim() || product.name}
            className="aspect-square w-full rounded-2xl bg-white/10 object-contain p-1.5 shadow-float ring-1 ring-white/10 sm:rounded-[20px] sm:object-cover sm:p-0"
          />
        </Link>
      </div>

      {variantSheet}
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
    <div className="animate-hero-slide grid gap-4 sm:grid-cols-[1.1fr_0.9fr] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
          <Sparkles className="size-3.5" aria-hidden />
          PulseShop
        </span>
        <p className="mt-3 text-[1.3rem] font-extrabold leading-[1.08] tracking-tight sm:text-[2rem] lg:text-[2.5rem]">
          Every shop, one search box.
        </p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed" style={{ color: "var(--hero-fg-dim)" }}>
          Browse independent Kenyan shops side by side, follow the ones you like, and check out
          without leaving the page.
        </p>
        <Link
          to="/shops"
          className="group mt-4 inline-flex items-center gap-2 rounded-full bg-primary py-1.5 pl-5 pr-1.5 text-sm font-bold text-on-accent transition-colors hover:bg-primary-deep sm:mt-5"
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
    <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr] sm:items-center sm:gap-6">
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
 * The way in by category, sitting directly on top of the thing it changes.
 *
 * IT USED TO BE DRAWN ON THE HERO, four sections further up the page. The
 * argument for that was that a category is a way IN rather than a way to
 * narrow, which is true of the idea and false of the control: the only thing
 * tapping one of these chips does is refilter the product grid at the bottom of
 * the page. From the hero, that was a control which appeared to do nothing —
 * the shopper pressed "Audio Equipment", the page did not visibly move, and the
 * result was four bands of scrolling away. Here it is the line above the grid,
 * so the answer is on screen the moment the chip is pressed.
 *
 * THE FILTERS BUTTON IS THE LAST CHIP, not a control of its own on a line of
 * its own. It is the same kind of thing as the chips beside it — one more way
 * to narrow the same grid — and it was previously a button sitting alone above
 * the results, spending a whole row of phone height to say one word. At the end
 * of the rail it costs nothing and it is where a hand already is, having just
 * swiped through the categories looking for something that is not there.
 *
 * IT IS THE ONLY FILTER CONTROL AT EVERY WIDTH NOW. Desktop used to carry a
 * 13-rem sidebar holding the same categories as a list, plus size, colour,
 * price and rating — a column of controls permanently open beside a grid that
 * was one tile narrower for it. The sidebar and the rail were two designs for
 * one job, kept in step by hand; this is the one that survives, because it is
 * the one that costs the grid nothing when nobody is filtering. Everything the
 * sidebar held is still there, behind the same chip, in the same sheet.
 *
 * IT IS TWO ROWS NOW: GENERALS, THEN SPECIFICS. The first row used to hold
 * every leaf category on the platform in one strip — Smartphones, Footwear,
 * Hair Care, Mattresses, Board Games, thirty-odd chips deep. That is not a
 * filter, it is a list to read, and the thing a shopper wants is almost always
 * past the right edge. Worse, the one question it could not answer is the
 * common one: "show me beauty" was six separate taps that could not be combined,
 * because picking a chip replaced the last.
 *
 * So the top row is the generals (Tech, Fashion, Beauty & Health — seven, which
 * fits), and picking one opens a second row holding only that general's
 * specifics. Those are TOGGLES, not a radio: "Hair Care and Cosmetics, nothing
 * else in beauty" is one selection made of two taps, which is exactly the thing
 * the flat rail could not express. Picking none of them means the whole general,
 * so the first tap is useful before any second one is made.
 *
 * The second row is absent, not empty, until a general is chosen — a permanently
 * reserved strip of nothing would cost the grid a row of height on a phone to
 * say what the row above already says.
 *
 * Icons because the top row has to be readable at a glance in peripheral
 * vision; the icon is what makes "Fashion" findable without reading every
 * label. The second row goes without: its chips are already scoped by the
 * general above them, and seven parcels in a row would say nothing.
 */
function CategoryRail({
  tree,
  group,
  onGroupChange,
  groupLeaves,
  subs,
  onToggleSub,
  onOpenFilters,
  activeFilterCount,
  className,
}: {
  /** The generals this catalogue can offer, each with the specifics in stock. */
  tree: { group: string; label: string; items: string[] }[];
  group: string;
  onGroupChange: (g: string) => void;
  groupLeaves: string[];
  subs: string[];
  onToggleSub: (leaf: string) => void;
  onOpenFilters: () => void;
  /** Everything switched on, categories included — the same figure the sheet's
   *  own badge shows, so the two never disagree. */
  activeFilterCount: number;
  className?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const { canLeft, canRight, scrollBy } = useRailScroll(rail, tree.length);
  const hasCategories = tree.length > 0;
  const openGroup = tree.find((g) => g.group === group);

  const filtersChip = (
    <button
      type="button"
      onClick={onOpenFilters}
      aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : "Filters"}
      className={cn(
        "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors",
        activeFilterCount > 0 ? "bg-primary text-on-accent" : "bg-card text-muted shadow-soft",
      )}
    >
      <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
      Filters
      {activeFilterCount > 0 && (
        <span className="flex size-5 items-center justify-center rounded-full bg-on-accent/25 text-[11px] font-bold">
          {activeFilterCount}
        </span>
      )}
    </button>
  );

  /** One chip in the top row. "All" is one of these, with no group behind it. */
  const groupChip = (key: string, label: string, active: boolean, onClick: () => void) => {
    const Icon = categoryIcon(label);
    return (
      <button
        key={key}
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors",
          active ? "bg-ink text-on-accent" : "bg-card text-muted shadow-soft hover:text-ink",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </button>
    );
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          {/* Desktop only, and only on the side that has somewhere to go. These
              sit ON the strip rather than in the page margin — there is no margin
              here at lg, the rail starts at the heading's left edge — so a left
              arrow drawn at rest would cover the "All" chip, which is the one
              chip a shopper needs to find to undo a filter. */}
          {canLeft && (
            <RailArrow
              side="left"
              label="categories"
              onClick={() => scrollBy(-1)}
              className="-left-1"
            />
          )}
          {canRight && (
            <RailArrow
              side="right"
              label="categories"
              onClick={() => scrollBy(1)}
              className="-right-1"
            />
          )}

          <div
            ref={rail}
            className={cn(
              // Full-bleed on a phone: the rail runs to both edges so the last
              // chip is visibly cut off rather than sitting neatly inside the
              // margin, which is the only thing that says "this scrolls". At lg
              // it stops at the pinned chip on its right instead, so the margins
              // come back to nothing.
              "no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 lg:mx-0 lg:px-0",
            )}
          >
            {hasCategories && (
              <>
                {groupChip("All", "All", group === ALL_GROUPS, () => onGroupChange(ALL_GROUPS))}
                {tree.map((g) =>
                  groupChip(g.group, g.label, g.group === group, () =>
                    // Tapping the open general again closes it. A chip that only
                    // ever selects leaves the shopper hunting for "All" to undo
                    // one tap.
                    onGroupChange(g.group === group ? ALL_GROUPS : g.group),
                  ),
                )}
              </>
            )}

            {/* Divided from the categories, because it does something different
                from all of them: it opens a panel rather than applying a filter. */}
            {hasCategories && <span className="my-2 w-px shrink-0 bg-line lg:hidden" aria-hidden />}
            <div className="shrink-0 lg:hidden">{filtersChip}</div>
          </div>
        </div>

        {/* THE SAME CHIP, PINNED, PAST lg. On a phone it is the last thing in the
            swipe, which is where a thumb ends up anyway. On a desktop the end of
            a horizontal scroller is somewhere a mouse may never go, and the one
            control that opens every remaining filter cannot be the one hidden
            past the right edge. Same button, same sheet, held still. */}
        <div className="hidden shrink-0 lg:block">{filtersChip}</div>
      </div>

      {/* THE SECOND LEVEL. Only under a chosen general, and only when that
          general has more than one specific in stock — a lone chip that cannot
          narrow anything is a control that does nothing. */}
      {openGroup && groupLeaves.length > 1 && (
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 lg:mx-0 lg:px-0">
          {/* Not a chip: it is the state the row falls back to, and drawing it
              as one more selectable pill would imply "all" and "Hair Care" are
              the same kind of choice. */}
          <span className="shrink-0 text-xs font-semibold text-muted">
            {subs.length === 0 ? `All of ${openGroup.label}` : `In ${openGroup.label}`}
          </span>
          {groupLeaves.map((leaf) => {
            const on = subs.includes(leaf);
            return (
              <button
                key={leaf}
                type="button"
                onClick={() => onToggleSub(leaf)}
                aria-pressed={on}
                className={cn(
                  "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                  on
                    ? "border-primary bg-primary text-on-accent"
                    : "border-line bg-card text-muted hover:text-ink",
                )}
              >
                {on && <Check className="size-3.5 shrink-0" aria-hidden />}
                {leaf}
              </button>
            );
          })}
        </div>
      )}
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

/**
 * The seven group labels, matched exactly rather than by keyword.
 *
 * The keyword table below is built for leaf names a seller typed, where a
 * guess is the best available answer. A group label is not a guess — there are
 * seven of them, they are ours, and they are the chips a shopper scans first,
 * so "Tech" and "Media" landing on the generic parcel (neither contains a word
 * the table knows) is a miss the ribbon cannot afford. Exact keys also mean a
 * renamed label shows up here as a lookup that no longer matches, rather than
 * silently degrading to a box.
 */
const GROUP_ICONS: Record<string, LucideIcon> = {
  Tech: Laptop,
  Fashion: Shirt,
  "Beauty & Health": SprayCan,
  Grocery: Utensils,
  "Home & Garden": Sofa,
  Media: BookOpen,
  "Kids & Baby": Baby,
  // The leftovers drawer (UNGROUPED): a parcel is the honest picture of "things
  // the taxonomy has no name for".
  More: Package,
};

function categoryIcon(name: string): LucideIcon {
  if (name === "All") return Sparkles;
  return (
    GROUP_ICONS[name] ?? CATEGORY_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? Package
  );
}

/**
 * The sponsored panel: the bought slots the hero has no room to rotate through.
 *
 * IT IS THE SAME INVENTORY AS THE HERO, IN A DIFFERENT SHAPE, and it is fed the
 * tail of the list rather than a copy of it — see HERO_SLOTS. A rotation only
 * sells the same thing to everybody while everybody can actually be reached; at
 * twelve seconds a slide, the back of a long queue is theoretical. This panel
 * is where that tail is visible at a glance instead of eventually, which also
 * makes it the unit an advertiser buys when they want to be READ rather than
 * waited for.
 *
 * TWO SHAPES, ONE DOM. Past lg it is that glanceable list: three cards stacked
 * in a column beside the hero, all visible at once, which is the whole pitch of
 * the unit. On a phone there is no column to stack in — the panel is full width
 * above the hero — and three stacked cards made it two and a half times the
 * hero's height, so the page opened on advertising and the shopper scrolled
 * past the catalogue to reach anything they came for. Below lg the same three
 * cards become one-at-a-time and swipe sideways, which puts the panel at the
 * hero's size and gives the two paid units the same footprint.
 *
 * THE SWIPE IS THE BROWSER'S, not a gesture handler. Scroll snapping does it in
 * CSS, so the carousel is momentum, rubber-banding and accessibility for free,
 * and the whole difference between the two shapes is a handful of lg: classes
 * rather than a second component or a JS breakpoint. The dots read the scroll
 * position back out; see useRailScroll.
 *
 * IT DOES NOT ADVANCE ON ITS OWN, unlike the hero. Two adverts auto-rotating on
 * one phone screen are two things moving in a shopper's peripheral vision while
 * they try to read a third, and the hero already owns that behaviour. Here the
 * shopper asks for the next one.
 *
 * LABELLED, always, on the panel and on every card in it. Same rule as the
 * hero: the free rotation elsewhere on the page only works because a shopper
 * can tell paid from earned, and a sponsored card that looks like an ordinary
 * product tile spends that distinction for one extra click.
 *
 * WITH NOTHING IN THE TAIL IT SELLS THE SLOT ITSELF rather than quietly filling
 * with free products. Borrowing the rotation here would put unpaid merchandise
 * under a Sponsored heading, which is the exact failure HouseSlide exists to
 * avoid at the top of the same row.
 */
function SponsoredPanel({
  items,
  loading,
  className,
}: {
  items: BannerProduct[];
  loading: boolean;
  className?: string;
}) {
  const track = useRef<HTMLUListElement>(null);
  const { index, scrollToIndex } = useRailScroll(track, items.length);

  /* Three, the column's worth. The phone carousel could carry the whole tail
     now that it costs no height, but the two widths showing a different number
     of adverts would make "how many did my slot appear beside" unanswerable. */
  const shown = items.slice(0, 3);

  return (
    <section
      aria-label="Sponsored products"
      /* min-w-0 is load-bearing, not tidying. This section is a GRID ITEM, and
         a grid item's default min-width is auto: it refuses to shrink below the
         width its contents want. Below lg its contents are now a horizontal
         track of three full-width cards, so "what the contents want" became
         three screens wide and the panel blew 140px out of its own cell and out
         of the phone shell with it. The same applies again to the track itself
         as a flex item of this column. Both need an explicit floor of zero
         before overflow-x can do its job. */
      className={cn("min-w-0 flex-col rounded-bento bg-card p-4 shadow-soft", className)}
    >
      {/* DESKTOP ONLY, and not because a phone has no room for a heading. On a
          phone this panel shows ONE card, and that card already wears a
          Sponsored badge — the heading was the same word twice, thirty pixels
          apart, which is how the panel ended up taller than the hero it is
          meant to match. The hero labels itself exactly this way: a badge on
          the slide and nothing above it. Past lg the heading comes back,
          because there it stands over three cards at once and says what the
          column IS. The section's aria-label carries the name at both widths,
          so nothing is lost to a screen reader. */}
      <div className="hidden items-start justify-between gap-2 lg:flex">
        <h2 className="flex items-center gap-1.5 text-sm font-bold leading-snug text-ink">
          <Megaphone className="size-4 shrink-0 text-warning" aria-hidden />
          Sponsored
        </h2>
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Paid placement
        </span>
      </div>

      {loading ? (
        <div className="flex-1 space-y-2 lg:mt-3">
          {/* One card's worth on a phone, where only one is on screen; the
              column's worth past lg. A skeleton that reserves three rows of a
              box that will hold one is a bigger lie than no skeleton. */}
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="hidden h-28 w-full rounded-2xl lg:block" />
          <Skeleton className="hidden h-28 w-full rounded-2xl lg:block" />
        </div>
      ) : items.length === 0 ? (
        <SponsorPitch />
      ) : (
        <>
          {/* Below lg: a snapping horizontal track, one card per screen.
              Past lg: the column it has always been, CENTRED rather than
              stacked at the top — the panel is as tall as the hero next door
              (lg:min-h-104) and usually holds two cards, so top-aligning them
              leaves a hand's width of empty card underneath, which reads as
              content that failed to load. */}
          <ul
            ref={track}
            className={cn(
              "no-scrollbar flex min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto lg:mt-3",
              "lg:min-h-0 lg:flex-1 lg:snap-none lg:flex-col lg:justify-center lg:overflow-x-visible",
            )}
          >
            {shown.map((item) => (
              <li key={item.placementId} className="w-full shrink-0 snap-start lg:w-auto">
                <SponsoredCard product={item} />
              </li>
            ))}
          </ul>

          {/* Phone only, because past lg every card is already on screen and a
              dot would be pointing at something the shopper can see. Same
              treatment as the hero's dots, in ink rather than white, so the two
              paid panels read as one family; no progress fill, because nothing
              here is on a clock. */}
          {shown.length > 1 && (
            <div className="mt-4 flex items-center gap-2 lg:hidden">
              {shown.map((item, i) => (
                <button
                  key={item.placementId}
                  type="button"
                  onClick={() => scrollToIndex(i)}
                  aria-label={`Show sponsored product ${i + 1} of ${shown.length}`}
                  aria-current={i === index}
                  className="group flex h-8 items-center focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-all duration-300",
                      "group-focus-visible:ring-2 group-focus-visible:ring-primary",
                      i === index ? "w-8 bg-ink" : "w-3 bg-line group-hover:bg-muted",
                    )}
                  />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * One bought slot, at list size rather than poster size.
 *
 * NOT A LINK WRAPPING EVERYTHING ANY MORE. It carries an add-to-cart button and
 * a link to the seller now, and a button inside an anchor is both invalid and
 * unusable — the anchor swallows the tap on some browsers and a screen reader
 * announces one control containing another. The picture and the headline are
 * the links to the product instead, which is where a shopper aims anyway.
 *
 * SAME SHAPE AND NOW THE SAME SIZE AS THE HERO SLIDE ON A PHONE, deliberately:
 * contained picture on the left at 7rem, then the label, the price and the two
 * things you can actually do. The two paid units sit one above the other below
 * lg, one card each, and every measurement that differed between them was a
 * reason for the eye to treat them as two unrelated widgets rather than as one
 * advertising band.
 *
 * IT SHRINKS BACK PAST lg, where three of these stack in a five-column panel
 * beside the hero rather than filling the width alone. Same card, two sizes,
 * because the space it is given is genuinely different in the two places.
 */
function SponsoredCard({ product }: { product: BannerProduct }) {
  const { addLabel, onAddClick, variantSheet } = useProductAdd(product);
  const soldOut = product.status === "out";

  return (
    <div className="group flex items-center gap-3 overflow-hidden rounded-2xl bg-fill/60 p-2 transition-colors hover:bg-fill">
      <Link to={productHref(product)} tabIndex={-1} aria-hidden className="shrink-0">
        {/* Contained rather than cropped, for the reason spelled out on
            HeroSlide: an 80px square cut out of the middle of a wide product
            shot is a texture, not a product. */}
        <ProductImage
          src={product.images[0]}
          alt={product.imageAlts?.[0]?.trim() || product.name}
          loading="lazy"
          className="size-28 shrink-0 rounded-xl bg-card object-contain p-1.5 transition-transform duration-300 group-hover:scale-[1.04] lg:size-20 lg:p-1"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="flex w-fit items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
          <Megaphone className="size-2.5" aria-hidden />
          Sponsored
        </span>
        {/* The seller's own copy when they bought some, the product name when
            they did not — the same fallback the hero slide uses, so one
            placement reads the same in both units. */}
        <Link to={productHref(product)} className="min-w-0">
          <p className="line-clamp-1 text-base font-extrabold leading-snug text-ink hover:text-primary lg:line-clamp-2 lg:text-xs">
            {product.headline?.trim() || product.name}
          </p>
        </Link>
        <p className="text-lg font-extrabold text-primary lg:text-sm">
          {hasPriceRange(product) && <span className="text-xs text-muted lg:text-[11px]">from </span>}
          {formatKes(minVariantPrice(product))}
        </p>

        {/* NO WRAPPING ON A PHONE. The card is 344px wide there and the shop
            chip carries a name the seller chose, so "Add" plus "Heelsilhouette"
            overflows and drops to a second line — on ONE of the three cards,
            which then sets the height of the whole track and put the panel 40px
            over the hero it is supposed to match. The chip truncates instead;
            it already had the min-w-0 to do it and was never given the chance.
            Past lg the cards are narrow and stacked, and wrapping is the right
            answer again. */}
        <div className="mt-1 flex items-center gap-1.5 lg:flex-wrap">
          {!soldOut && (
            <button
              type="button"
              onClick={onAddClick}
              aria-label={addLabel}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-bold text-on-accent transition-colors hover:bg-primary-deep lg:min-h-8 lg:gap-1 lg:px-2.5 lg:text-[11px]"
            >
              <ShoppingBag className="size-4 shrink-0 lg:size-3.5" aria-hidden />
              Add
            </button>
          )}
          {product.shopSlug && product.shopName && (
            <Link
              to={`/${product.shopSlug}`}
              className="inline-flex min-h-9 min-w-0 max-w-full items-center gap-1.5 rounded-full bg-card px-3 text-sm font-semibold text-muted ring-1 ring-line transition-colors hover:text-ink lg:min-h-8 lg:gap-1 lg:px-2.5 lg:text-[11px]"
            >
              <Store className="size-3.5 shrink-0 lg:size-3" aria-hidden />
              <span className="truncate">{product.shopName}</span>
            </Link>
          )}
        </div>
      </div>

      {variantSheet}
    </div>
  );
}

/**
 * What the panel says when the tail is empty — which, on a young platform, is
 * most days.
 *
 * The platform's own pitch, not borrowed inventory, for the reason HouseSlide
 * spells out one panel to the left. An unsold advert slot is the one piece of
 * space a marketplace can honestly talk about itself in, and this is the panel
 * where "talking about itself" and "the thing being sold" are the same
 * sentence.
 */
function SponsorPitch() {
  return (
    <div className="mt-3 flex flex-1 flex-col justify-center rounded-2xl bg-fill/60 p-4 text-center">
      <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-warning/15">
        <Megaphone className="size-5 text-warning" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-extrabold text-ink">This slot is open</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Sponsored placement puts one of your products at the top of the marketplace, labelled and
        in front of every shopper who lands here.
      </p>
      <Link
        to="/prices"
        className="mt-3 inline-flex items-center justify-center gap-1.5 self-center rounded-full bg-ink px-4 py-2 text-xs font-bold text-on-accent transition-opacity hover:opacity-90"
      >
        See what it costs
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </div>
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
 * The shops, as one rail at every width.
 *
 * There used to be two components for this: a vertical card of five shops in
 * the desktop bento, and this rail on phones. Two shapes for one answer, chosen
 * by window width, and the card was the weaker of them — a shop is an avatar
 * and a name, which reads horizontally, so a column of them spent the tallest
 * slot in the bento on the least visual content in it. The card is gone and
 * this is what both widths get.
 *
 * A rail is not competing for vertical space with anything, so it can afford to
 * show every shop the query returned: scrolling sideways costs the page nothing,
 * where each extra row in the old card pushed the whole bento column taller.
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
          : shops.slice(0, 12).map((shop) => (
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
 * The wishlist and the cart, as phone-sized controls in the masthead.
 *
 * Neither is a duplicate of its tab so much as a shortcut to it from where the
 * thumb already is. The tab bar is the permanent home for the destination;
 * these are the two that stay reachable while the shopper is head-down in the
 * category wall, and they are the only controls on the page carrying a number
 * that changes as the shopper works — which is the whole argument for lifting
 * them up here. "Did that save?" and "did that go in?" should be answerable
 * without navigating and without scrolling.
 *
 * Deliberately NOT wired through DesktopQuickNav: that component's icon row is
 * lg-only by design, and forcing it to render two of its four icons on a phone
 * would make it two components pretending to be one.
 */
function HeaderIconLink({
  to,
  label,
  count,
  icon: Icon,
}: {
  to: string;
  label: string;
  count: number;
  icon: LucideIcon;
}) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          "relative flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          isActive ? "border-primary/40 bg-primary/10 text-primary" : "border-line bg-card text-ink",
        )
      }
    >
      <Icon className="size-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-favorite px-1 text-[10px] font-bold text-white ring-2 ring-card">
          {count}
        </span>
      )}
    </NavLink>
  );
}

function WishlistButton() {
  const count = useFavorites((s) => s.favorites.length);
  return (
    <HeaderIconLink
      to="/favorites"
      label={count > 0 ? `Wishlist, ${count} saved` : "Wishlist"}
      count={count}
      icon={Heart}
    />
  );
}

function CartButton() {
  const qty = useCart((s) => cartCount(s.items));
  return (
    <HeaderIconLink
      to="/cart"
      label={qty > 0 ? `Cart, ${qty} item${qty === 1 ? "" : "s"}` : "Cart"}
      count={qty}
      icon={ShoppingBag}
    />
  );
}

/**
 * The search box, and the one control on the masthead that had to give up
 * height for the row to fit on one line.
 *
 * 40px rather than 44px, and the right-hand padding is only reserved when the
 * clear button is actually there — an empty field was holding forty pixels open
 * for a control that had not appeared yet, on the width where forty pixels is
 * the difference between a readable placeholder and a clipped one. The
 * placeholder itself steps down a point below sm for the same reason.
 */
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
        className={cn(
          "h-10 w-full rounded-full border border-line bg-card pl-9 text-sm outline-none lg:h-11",
          "placeholder:text-[13px] sm:placeholder:text-sm",
          "focus:border-primary focus:ring-2 focus:ring-primary/20",
          "[&::-webkit-search-cancel-button]:appearance-none",
          value ? "pr-10" : "pr-3",
        )}
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
 * Deals of the day: every marked-down product on the platform.
 *
 * A WHOLE-TABLE QUERY, not a filtered page (migration 0058). The obvious
 * version of this shelf fetches a page of products and keeps the ones with a
 * discount, which would make "every product on discount" mean "whichever
 * discounts happened to fall in the first twelve rows" — and would go empty the
 * day a shop lists a dozen full-price items. The RPC orders by the size of the
 * discount, so the shelf leads with the biggest saving rather than the newest
 * listing, and this component does not re-sort it.
 *
 * A RAIL, NOT A GRID, AT EVERY WIDTH. It was a grid on the argument that deals
 * are merchandise and merchandise wants comparing. True, and it lost the
 * argument to the page: a grid of every marked-down product grows downward
 * without limit, so the more successful the shelf was the further it pushed the
 * catalogue, the shops and the history rail below the fold. A rail spends one
 * band of height whether there are four deals or forty, and horizontal is how
 * every other "here is a set of things" band on this page already reads.
 *
 * ORDER SURVIVES THE CHANGE, and that is why the rail is the right shape here
 * rather than a compromise: the RPC returns biggest saving first, and the first
 * thing in a rail is the thing everybody sees. In a grid that ordering was
 * spent on a row of four and then buried.
 *
 * FULL PRODUCT CARDS, not the thumbnails the history rail uses. The savings
 * badge, the struck-through price and the add button are the entire point of
 * this shelf, and they already exist on ProductCard.
 *
 * NOTHING ON OFFER MEANS NO SECTION. A heading that promises deals over an
 * empty row is worse than one fewer band on the page.
 */
function DealsShelf({
  items,
  loading,
  className,
}: {
  items: Product[];
  loading: boolean;
  className?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const { canLeft, canRight, scrollBy } = useRailScroll(rail, items.length);

  if (loading) {
    return (
      <section className={className} aria-label="Deals of the day">
        <Skeleton className="mb-3 h-6 w-44 rounded" />
        <div className={DEALS_RAIL_CLASS}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={DEALS_TILE_CLASS}>
              <ProductCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className={cn("relative", className)} aria-label="Deals of the day">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink lg:text-2xl">
          <Tag className="size-5 text-favorite" aria-hidden />
          Deals of the day
        </h2>
        <p className="text-xs font-semibold text-muted lg:text-sm">
          {items.length} {items.length === 1 ? "product is" : "products are"} marked down right now
        </p>
      </div>

      <div className="relative">
        {/* Desktop only, like every other rail here: a touch device drags the
            strip itself, and an arrow there would sit on top of the thing it
            scrolls. Each side appears only while it has somewhere to go. */}
        {canLeft && <RailArrow side="left" label="deals" onClick={() => scrollBy(-1)} />}
        {canRight && <RailArrow side="right" label="deals" onClick={() => scrollBy(1)} />}

        <div ref={rail} className={DEALS_RAIL_CLASS}>
          {items.map((p) => (
            <div key={p.id} className={DEALS_TILE_CLASS}>
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Full-bleed and snapping, matching the browsing history rail below. The
   negative margins track the page's own padding so the last tile is visibly cut
   by the edge of the screen rather than stopping neatly inside it — which is
   the only thing that tells a shopper there is more to the right. */
const DEALS_RAIL_CLASS =
  "no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:-mx-6 lg:px-6";

/* Wide enough to read a two-line product name, narrow enough that the next tile
   always peeks past the edge on a phone. */
const DEALS_TILE_CLASS = "w-[45%] shrink-0 snap-start sm:w-52 lg:w-56";


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
