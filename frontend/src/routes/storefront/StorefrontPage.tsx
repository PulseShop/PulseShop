import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, LayoutGrid, List, Package, Search, SlidersHorizontal, Star, Store, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuth } from "@/stores/auth";
import { useShop } from "@/stores/shop";
import { MobileShell } from "@/components/layout/MobileShell";
import { DesktopQuickNav } from "@/components/layout/DesktopQuickNav";
import { LogoLink } from "@/components/common/Logo";
import { ProductCard } from "@/components/product/ProductCard";
import { PriceRangeFilter } from "@/components/product/PriceRangeFilter";
import { QueryError } from "@/components/common/QueryError";
import { FollowButton } from "@/components/shop/FollowButton";
import { FulfillmentBadge } from "@/components/shop/FulfillmentBadge";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopStatusDot } from "@/components/shop/ShopStatusDot";
import { SocialLinks } from "@/components/shop/SocialLinks";
import { Sheet } from "@/components/ui/Modal";
import { ProductCardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { colorHex, sortSizes } from "@/lib/constants";
import { capacityLabel, conditionLabel } from "@/lib/productSpecs";
import { formatKes } from "@/lib/currency";
import { merchantSocialLinks } from "@/lib/deeplinks";
import { shopSeo } from "@/lib/seo";
import { seoShopFrom } from "@/lib/seoFrom";
import { useDebounced } from "@/hooks/useDebounced";
import { useSeo } from "@/hooks/useSeo";
import { cn } from "@/lib/utils";
import { services } from "@/services";

type SortOrder = "newest" | "price-asc" | "price-desc";

const PAGE_SIZE = 12;

/** Shared by the results and their skeletons, so the placeholder lays out the
 *  same way the real thing will and the page doesn't reflow when it lands. */
const GRID_CLASS = "grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4";
const LIST_CLASS = "flex flex-col gap-3";

export function StorefrontPage() {
  // When a :shopSlug is in the URL we're on a public shop (pulseshop.space/<slug>);
  // otherwise it's the signed-in merchant previewing their own store at /shop.
  const { shopSlug } = useParams();
  const isPublic = Boolean(shopSlug);
  const homeTo = shopSlug ? `/${shopSlug}` : "/shop";
  const session = useAuth((s) => s.session);

  // Remember the shop being browsed so the rest of the consumer flow can return here.
  const setShopSlug = useShop((s) => s.setSlug);
  useEffect(() => {
    setShopSlug(shopSlug ?? null);
  }, [shopSlug, setShopSlug]);

  // A search typed from the product detail page arrives as ?q= — land here
  // with it already applied instead of making the shopper retype it.
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState(initialQuery);
  /**
   * Debounced before it reaches the query, the same way /shops does it.
   * The field used to be behind a magnifier toggle; now that it is always on
   * screen it gets typed into far more, and `search` sits in the query key, so
   * every keystroke was its own server-side search_products call. React Query
   * dedupes repeat keys, not the distinct ones a word types out through.
   */
  const term = useDebounced(search.trim());

  const [sort, setSort] = useState<SortOrder>("newest");
  const [availableOnly, setAvailableOnly] = useState(false);
  // A band, not a ceiling (migration 0048). Either end may stay null, which
  // means "no bound there" rather than a bound that happens to match everything.
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  // Multi-select: picking M and L means "available in either", which is what a
  // shopper who wears both means. Server-side (array overlap, migration 0026).
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [minRating, setMinRating] = useState<number | null>(null);
  // Structured Phone/PC spec filters (migration 0038). ramMin/storageMin are
  // "at least" thresholds; conditions is multi-select like sizes.
  const [productType, setProductType] = useState<"phone" | "pc" | null>(null);
  const [ramMin, setRamMin] = useState<number | null>(null);
  const [storageMin, setStorageMin] = useState<number | null>(null);
  const [conditions, setConditions] = useState<string[]>([]);
  // Mobile has no room for the sidebar, so the same controls live in a sheet.
  const [filtersOpen, setFiltersOpen] = useState(false);
  /**
   * Grid tiles or list rows. A square tile has nowhere to put the structured
   * Phone/PC specs, so on a shop selling twelve similar handsets every tile
   * reads the same and the only way to compare is to open each one. Rows have
   * the width for the specs the shopper is actually choosing between.
   *
   * Component state, so it resets between visits. Persisting it is a
   * preference worth having, but it belongs with the rest of the device-local
   * state in a store rather than bolted on here.
   */
  const [view, setView] = useState<"grid" | "list">("grid");

  const toggleIn = (setter: (fn: (v: string[]) => string[]) => void) => (value: string) =>
    setter((list) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]));

  const activeFilterCount =
    sizes.length +
    colors.length +
    conditions.length +
    (availableOnly ? 1 : 0) +
    // One decision, one chip, however many ends of the band are set.
    (minPrice !== null || maxPrice !== null ? 1 : 0) +
    (minRating !== null ? 1 : 0) +
    (productType !== null ? 1 : 0) +
    (ramMin !== null ? 1 : 0) +
    (storageMin !== null ? 1 : 0);

  /**
   * Every active filter as one removable chip, shown above the results.
   *
   * The filter state is spread across nine pieces, two of them multi-select and
   * three of them only rendered when the shop stocks phones or PCs — so on
   * mobile, where the controls live behind a sheet, "12 products found" with no
   * visible reason why was the whole feedback a shopper got. The count in the
   * Filters pill said how many were on, never which.
   *
   * Built in the same order as activeFilterCount counts them, and its length is
   * that number by construction.
   */
  const appliedFilters: { key: string; label: string; remove: () => void }[] = [
    ...sizes.map((s) => ({ key: `size:${s}`, label: s, remove: () => toggleIn(setSizes)(s) })),
    ...colors.map((c) => ({ key: `color:${c}`, label: c, remove: () => toggleIn(setColors)(c) })),
    ...conditions.map((c) => ({
      key: `condition:${c}`,
      label: conditionLabel(c),
      remove: () => toggleIn(setConditions)(c),
    })),
    ...(availableOnly
      ? [{ key: "available", label: "Available only", remove: () => setAvailableOnly(false) }]
      : []),
    ...(minPrice !== null || maxPrice !== null
      ? [
          {
            key: "price",
            label:
              minPrice !== null && maxPrice !== null
                ? `${formatKes(minPrice)} to ${formatKes(maxPrice)}`
                : minPrice !== null
                  ? `${formatKes(minPrice)} and up`
                  : `Under ${formatKes(maxPrice ?? 0)}`,
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
    ...(productType !== null
      ? [
          {
            key: "type",
            label: productType === "phone" ? "Phones" : "Computers",
            remove: () => setProductType(null),
          },
        ]
      : []),
    ...(ramMin !== null
      ? [{ key: "ram", label: `${capacityLabel(ramMin)}+ RAM`, remove: () => setRamMin(null) }]
      : []),
    ...(storageMin !== null
      ? [
          {
            key: "storage",
            label: `${capacityLabel(storageMin)}+ storage`,
            remove: () => setStorageMin(null),
          },
        ]
      : []),
  ];

  const clearFilters = () => {
    setSizes([]);
    setColors([]);
    setAvailableOnly(false);
    setMaxPrice(null);
    setMinRating(null);
    setProductType(null);
    setRamMin(null);
    setStorageMin(null);
    setConditions([]);
  };

  const merchantQ = useQuery({
    queryKey: shopSlug ? ["shop", shopSlug] : ["merchant"],
    queryFn: () => (shopSlug ? services.products.getShop(shopSlug) : services.products.getMerchant()),
  });
  const merchant = merchantQ.data;


  /**
   * The grid is server-filtered, server-sorted and paged (search_products,
   * migration 0022). It used to fetch the shop's entire catalogue and do all of
   * this in the browser — which meant a 3,000-product shop shipped 3,000 rows
   * and rendered 3,000 cards on first paint. Filtering has to move server-side
   * along with the paging, or a filter would only ever search the loaded page.
   */
  const productQuery = {
    search: term,
    category,
    status: availableOnly ? ("in-stock" as const) : ("all" as const),
    minPrice,
    maxPrice,
    sizes,
    colors,
    minRating,
    productType: productType ?? undefined,
    ramMin,
    storageMin,
    conditions,
    sort,
    pageSize: PAGE_SIZE,
  };

  // Keyed on the slug, not merchant.id: on the merchant's own /shop preview the
  // id arrives a tick after the first render, and keying on it would throw away
  // the in-flight page and refetch the moment it landed.
  const productsQ = useInfiniteQuery({
    queryKey: ["shop-products", shopSlug ?? "self", productQuery],
    queryFn: ({ pageParam }) =>
      shopSlug
        ? services.products.listShopProducts(merchant!.id, { ...productQuery, page: pageParam })
        : services.products.listProducts({ ...productQuery, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? all.length + 1 : undefined;
    },
    enabled: shopSlug ? Boolean(merchant) : true,
    placeholderData: keepPreviousData,
  });

  const filtered = productsQ.data?.pages.flatMap((p) => p.items) ?? [];
  const totalMatches = productsQ.data?.pages[0]?.total ?? 0;

  // Category pills and the price-slider ceiling are aggregates over the whole
  // catalogue, so they can't be derived from a page of it.
  const facetsQ = useQuery({
    queryKey: ["shop-facets", shopSlug ?? "self"],
    queryFn: () => services.products.getFacets(shopSlug ? merchant!.id : undefined),
    enabled: shopSlug ? Boolean(merchant) : true,
  });

  const categories = ["All", ...(facetsQ.data?.categories ?? [])];
  const priceFloor = facetsQ.data?.priceFloor ?? 0;
  const priceCeiling = facetsQ.data?.priceCeiling ?? 0;
  // Only what this shop actually stocks — offering a filter that can only ever
  // return nothing is worse than offering none.
  const sizeOptions = sortSizes(facetsQ.data?.sizes ?? []);
  const colorOptions = facetsQ.data?.colors ?? [];
  // Spec filters only appear when this shop actually stocks phones/PCs.
  const typeOptions = facetsQ.data?.productTypes ?? [];
  const ramOptions = facetsQ.data?.ram ?? [];
  const storageOptions = facetsQ.data?.storage ?? [];
  const conditionOptions = facetsQ.data?.conditions ?? [];

  /**
   * Only the PUBLIC storefront gets indexable tags. `/shop` is the same
   * component in the merchant's own preview mode — one seller's private view of
   * their catalogue — so it stays noindex and never claims the canonical URL
   * that `/{handle}` owns. Two URLs asserting the same canonical is how a page
   * gets dropped from the index.
   */
  useSeo(
    useMemo(
      () => (isPublic && merchant
          ? shopSeo(seoShopFrom(merchant, facetsQ.data?.categories ?? []), window.location.origin)
          : null),
      [isPublic, merchant, facetsQ.data?.categories],
    ),
  );

  /**
   * The search field, rendered twice: inline in the header on desktop, and as
   * its own row beneath it on a phone, where there is no room beside the
   * wordmark. Only ever one of the two is in the accessibility tree, since the
   * other is display:none.
   *
   * It replaced a magnifier that toggled a field open. A shop with a hundred
   * products needs the field itself in front of the shopper, not a control that
   * reveals one; the toggle also meant the shopper had to know search existed
   * before they could use it. No autoFocus: it is on screen from the start now,
   * and focusing it on load would throw the keyboard up over the grid on every
   * visit.
   */
  const searchField = (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search products"
        placeholder="Search products…"
        // WebKit paints its own clear affordance on type="search"; ours is
        // styled and keyboard-labelled, so the native one is suppressed rather
        // than shown twice.
        className="h-11 w-full rounded-btn border border-line bg-card pl-9 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {search && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setSearch("")}
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-fill hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );

  /** Size, colour, price and availability — rendered in the desktop sidebar and,
   * identically, inside the mobile filter sheet. */
  const filterControls = (
    <>
      {sizeOptions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-ink">Size</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {sizeOptions.map((s) => (
              <FilterChip
                key={s}
                label={s}
                active={sizes.includes(s)}
                onClick={() => toggleIn(setSizes)(s)}
              />
            ))}
          </div>
        </div>
      )}

      {colorOptions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-ink">Colour</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {colorOptions.map((c) => (
              <FilterChip
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

      {typeOptions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-ink">Type</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {typeOptions.map((t) => (
              <FilterChip
                key={t}
                label={t === "phone" ? "Phones" : "Computers"}
                active={productType === t}
                onClick={() => setProductType(productType === t ? null : (t as "phone" | "pc"))}
              />
            ))}
          </div>
        </div>
      )}

      {ramOptions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-ink">RAM (minimum)</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {ramOptions.map((gb) => (
              <FilterChip
                key={gb}
                label={`${capacityLabel(gb)}+`}
                active={ramMin === gb}
                onClick={() => setRamMin(ramMin === gb ? null : gb)}
              />
            ))}
          </div>
        </div>
      )}

      {storageOptions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-ink">Storage (minimum)</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {storageOptions.map((gb) => (
              <FilterChip
                key={gb}
                label={`${capacityLabel(gb)}+`}
                active={storageMin === gb}
                onClick={() => setStorageMin(storageMin === gb ? null : gb)}
              />
            ))}
          </div>
        </div>
      )}

      {conditionOptions.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-ink">Condition</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {conditionOptions.map((c) => (
              <FilterChip
                key={c}
                label={conditionLabel(c)}
                active={conditions.includes(c)}
                onClick={() => toggleIn(setConditions)(c)}
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
            <button
              key={r}
              type="button"
              aria-pressed={minRating === r}
              onClick={() => setMinRating(minRating === r ? null : r)}
              className={cn(
                "flex min-h-9 items-center gap-1 rounded-btn border-2 px-2.5 text-sm font-semibold transition-colors",
                minRating === r
                  ? "border-primary bg-primary text-on-accent"
                  : "border-line bg-card text-ink hover:border-primary/50",
              )}
            >
              <Star
                className={cn(
                  "size-4",
                  minRating === r ? "fill-white text-white" : "fill-amber-400 text-amber-400",
                )}
              />
              {r}+
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-ink">Availability</h2>
        <label className="mt-3 flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
            className="size-4 rounded accent-primary"
          />
          Available only
        </label>
      </div>

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={clearFilters}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Clear all filters
        </button>
      )}
    </>
  );

  // Merchant fetch failed (DB down, offline) -> explicit retry instead of an
  // infinite skeleton — the `merchant ? … : <Skeleton>` branch below can't
  // tell "still loading" from "never going to load".
  if (merchantQ.isError) {
    return (
      <MobileShell nav={false}>
        <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-danger/10">
            <AlertTriangle className="size-7 text-danger" />
          </div>
          <p className="text-lg font-bold text-ink">Couldn't load this shop</p>
          <p className="max-w-xs text-sm text-muted">Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => merchantQ.refetch()}
            className="mt-1 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Try again
          </button>
        </div>
      </MobileShell>
    );
  }

  // Public shop that doesn't exist, OR has wound down for good ('closing' is
  // hidden everywhere else — search, directory, sitemap — so its storefront
  // URL has to agree) -> friendly not-found instead of a stuck skeleton.
  if (isPublic && merchantQ.isSuccess && (!merchant || merchant.shopStatus === "closing")) {
    return (
      <MobileShell nav={false}>
        <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-fill">
            <Store className="size-7 text-muted" />
          </div>
          <p className="text-lg font-bold text-ink">Shop not found</p>
          <p className="max-w-xs text-sm text-muted">
            There's no shop at <span className="font-semibold text-ink">/{shopSlug}</span>.
          </p>
          <Link to="/" className="mt-1 font-semibold text-primary">
            Go to PulseShop
          </Link>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell homeTo={homeTo} wide>
      {/* header row */}
      <header className="glass-header sticky top-0 z-30 px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Merchant previewing their own store via "View as buyer" — give
                them a way back that isn't the browser back button. */}
            {!isPublic && session?.accountType === "merchant" && (
              <Link
                to="/dashboard"
                aria-label="Back to dashboard"
                className="flex size-11 items-center justify-center rounded-full text-ink hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ArrowLeft className="size-5" />
              </Link>
            )}
            {/* The wordmark is the way back to the marketplace, which from
                inside a storefront had no control at all. It goes to "/" and
                not to this shop: it says PulseShop. */}
            <LogoLink size={28} wordmark className="lg:hidden" />
            {/* desktop: shop identity takes the wordmark's place, once loaded */}
            {merchant && (
              <Link to={homeTo} className="hidden items-center gap-2.5 lg:flex">
                <img
                  src={merchant.avatarUrl}
                  alt=""
                  className="size-8 rounded-full object-cover"
                />
                <span className="text-sm font-extrabold text-ink">{merchant.name}</span>
              </Link>
            )}
          </div>

          {/* Desktop has the width to carry the field in the header row itself. */}
          <div className="hidden min-w-0 flex-1 lg:block lg:max-w-md">{searchField}</div>

          <div className="flex items-center gap-1 lg:gap-2">
            {/* The same nav cluster as every other buyer page — this header used
                to carry its own half of it (Favorites, Cart, Account, but no
                Home and no Shops), so leaving a storefront meant the logo or
                the browser's back button. */}
            <DesktopQuickNav />
            {merchant && (
              <div className="ml-1 hidden items-center gap-1.5 border-l border-line pl-3 lg:flex">
                <SocialLinks
                  links={merchantSocialLinks(merchant)}
                  ariaPrefix="Chat on"
                  size="size-9"
                  iconSize="size-4"
                />
              </div>
            )}
          </div>
        </div>

        {/* Phone: its own row under the wordmark, still inside the sticky
            header so it stays reachable however far the grid has scrolled. */}
        <div className="mt-2.5 lg:hidden">{searchField}</div>
      </header>

      {/* store banner */}
      {merchant?.bannerUrl && (
        <div className="h-28 w-full overflow-hidden">
          <img src={merchant.bannerUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      {/* merchant hero — centered stack on mobile, horizontal band on desktop */}
      <section className={cn("px-4 lg:px-6", merchant?.bannerUrl ? "pt-0" : "pt-5 lg:pt-6")}>
        {merchant ? (
          <div className="flex flex-col items-center text-center lg:flex-row lg:items-center lg:justify-between lg:text-left">
            <div className="flex flex-col items-center text-center lg:flex-row lg:items-center lg:gap-5 lg:text-left">
              <div className={cn("relative", merchant.bannerUrl && "-mt-10 lg:mt-0")}>
                <img
                  src={merchant.avatarUrl}
                  alt={merchant.name}
                  className="size-20 rounded-full object-cover ring-4 ring-card shadow-soft lg:size-24"
                />
                <ShopStatusDot status={merchant.shopStatus} className="absolute bottom-1 right-1" />
              </div>
              <div>
                <h1 className="mt-3 text-xl font-extrabold text-ink lg:mt-0 lg:text-2xl">
                  {merchant.name}
                </h1>
                <p className="text-sm text-muted">
                  @{merchant.handle} · {merchant.location}
                </p>
                <p className="mt-2 max-w-xs text-sm text-ink/80 lg:max-w-sm">{merchant.bio}</p>
                {/* How orders reach the buyer, stated up front rather than at
                    the end of checkout — see FulfillmentBadge. */}
                <div className="mt-2 flex justify-center lg:justify-start">
                  <FulfillmentBadge fulfillment={merchant.fulfillment} />
                </div>
                {merchant.shopStatus === "closed" && (
                  <span className="mt-2 inline-flex items-center rounded-full bg-warning/10 px-3 py-1 text-xs font-bold text-warning">
                    Temporarily closed — not accepting orders right now
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 flex w-full max-w-xs flex-col items-center gap-4 lg:mt-0 lg:w-auto lg:max-w-none lg:items-end">
              <div className="flex w-full justify-between rounded-card bg-card px-6 py-3 shadow-soft lg:w-auto lg:gap-6">
                <Stat icon={<Package className="size-4 text-primary" />} value={merchant.stats.products} label="Products" />
                <Stat icon={<Star className="size-4 fill-amber-400 text-amber-400" />} value={merchant.stats.rating.toFixed(1)} label="Rating" />
                <Stat icon={<Users className="size-4 text-primary" />} value={merchant.stats.followers} label="Followers" />
              </div>

              <div className="flex items-center gap-2">
                {/* follow only makes sense on someone else's shop */}
                {isPublic && session?.id !== merchant.id && (
                  <FollowButton merchantId={merchant.id} className="h-11 px-5" />
                )}
                <SocialLinks links={merchantSocialLinks(merchant)} ariaPrefix="Chat on" size="size-11" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col items-center gap-3 lg:flex-row lg:gap-5">
              <Skeleton className="size-20 rounded-full lg:size-24" />
              <div className="flex flex-col items-center gap-3 lg:items-start">
                <Skeleton className="h-6 w-40 rounded" />
                <Skeleton className="h-4 w-56 rounded" />
              </div>
            </div>
            <Skeleton className="h-14 w-full max-w-xs lg:w-64" />
          </div>
        )}
      </section>

      {/* category pills + filter entry — mobile only; desktop uses the sidebar */}
      <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {(sizeOptions.length > 0 || colorOptions.length > 0 || priceCeiling > 0) && (
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label={
              activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : "Filters"
            }
            className={cn(
              "flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              activeFilterCount > 0
                ? "bg-ink text-on-accent"
                : "bg-card text-muted shadow-soft hover:text-ink",
            )}
          >
            <SlidersHorizontal className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-card/25 text-[11px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={cn(
              "flex min-h-11 flex-shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              cat === category
                ? "bg-primary text-on-accent"
                : "bg-card text-muted shadow-soft hover:text-ink",
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="px-4 pb-6 pt-4 lg:flex lg:gap-8 lg:px-6">
        {/* desktop sidebar — categories, price, availability */}
        <aside className="hidden shrink-0 lg:block lg:w-56">
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-bold text-ink">Categories</h2>
              <ul className="mt-3 space-y-1">
                {categories.map((cat) => (
                  <li key={cat}>
                    <button
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-btn px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
                        cat === category ? "text-primary" : "text-muted hover:text-ink",
                      )}
                    >
                      {cat}
                      {cat === category && <Check className="size-4" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {filterControls}
          </div>
        </aside>

        {/* product grid */}
        <section className="flex-1">
          {/* Applied filters, above the results and outside the loading branch
              — a shopper narrowing to nothing needs to see WHICH filter did it,
              and that is exactly the case where the grid below is empty. */}
          {appliedFilters.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {appliedFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={f.remove}
                  aria-label={`Remove filter: ${f.label}`}
                  className="flex min-h-8 items-center gap-1 rounded-full bg-primary/10 pl-3 pr-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {f.label}
                  <X className="size-3.5" aria-hidden />
                </button>
              ))}
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-8 rounded-full px-2 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Clear all
              </button>
            </div>
          )}

          {!productsQ.isLoading && !productsQ.isError && (
            // Was desktop-only, which left the phone with no result count, no
            // sort and nowhere to put the view switch.
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              {/* the full match count from the server, not just what's loaded */}
              <p className="text-sm text-muted">{totalMatches} products found</p>
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
                        "flex size-8 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
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
              title="Couldn't load products"
              onRetry={() => productsQ.refetch()}
              retrying={productsQ.isFetching}
            />
          ) : filtered.length === 0 ? (
            <div className="rounded-card bg-card p-8 text-center shadow-soft">
              <p className="font-semibold text-ink">No products found</p>
              <p className="mt-1 text-sm text-muted">Try a different category or search.</p>
            </div>
          ) : (
            <>
              <div
                // `term`, not `search`: keyed on the raw field the grid would
                // replay its fade-in on every keystroke, while the results
                // underneath only change once the debounce settles.
                key={`${category}-${term}-${sort}-${availableOnly}-${maxPrice}-${sizes}-${colors}-${minRating}`}
                className={cn("animate-grid-fade", view === "grid" ? GRID_CLASS : LIST_CLASS)}
              >
                {filtered.map((p) => (
                  <ProductCard key={p.id} product={p} layout={view === "list" ? "row" : "grid"} />
                ))}
              </div>

              {productsQ.hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => productsQ.fetchNextPage()}
                    disabled={productsQ.isFetchingNextPage}
                    className="w-full rounded-btn border border-line bg-card px-6 py-3 text-sm font-bold text-ink shadow-soft disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:w-auto"
                  >
                    {productsQ.isFetchingNextPage
                      ? "Loading…"
                      : `Load more (${totalMatches - filtered.length} left)`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Public storefront only — a way back out to other shops, since drilling
          into one shop otherwise strands the browser here. */}
      {isPublic && <ShopFooter excludeId={merchant?.id} />}

      {/* mobile filters — the same controls as the desktop sidebar */}
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

/** One toggleable filter value. `swatch` paints the colour dot for colours. */
function FilterChip({
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

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-base font-extrabold text-ink">{value}</span>
      </div>
      <span className="text-[11px] font-medium text-muted">{label}</span>
    </div>
  );
}
