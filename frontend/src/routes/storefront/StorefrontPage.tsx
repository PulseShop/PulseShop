import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Package, Search, ShoppingBag, Star, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuth } from "@/stores/auth";
import { useShop } from "@/stores/shop";
import { MobileShell } from "@/components/layout/MobileShell";
import { ProductCard } from "@/components/product/ProductCard";
import { FollowButton } from "@/components/shop/FollowButton";
import { SocialLinks } from "@/components/shop/SocialLinks";
import { ProductCardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { merchantSocialLinks } from "@/lib/deeplinks";
import { cn } from "@/lib/utils";
import { services } from "@/services";

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
  const [searchOpen, setSearchOpen] = useState(Boolean(initialQuery));

  const merchantQ = useQuery({
    queryKey: shopSlug ? ["shop", shopSlug] : ["merchant"],
    queryFn: () => (shopSlug ? services.products.getShop(shopSlug) : services.products.getMerchant()),
  });
  const merchant = merchantQ.data;

  const productsQ = useQuery({
    queryKey: shopSlug ? ["shop-products", shopSlug] : ["products"],
    queryFn: () =>
      shopSlug
        ? services.products.listShopProducts(merchant!.id)
        : services.products.listProducts(),
    enabled: shopSlug ? Boolean(merchant) : true,
  });

  const categories = useMemo(() => {
    const cats = new Set((productsQ.data ?? []).map((p) => p.category));
    return ["All", ...cats];
  }, [productsQ.data]);

  const filtered = useMemo(() => {
    let list = productsQ.data ?? [];
    if (category !== "All") list = list.filter((p) => p.category === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [productsQ.data, category, search]);

  // Public shop that doesn't exist -> friendly not-found instead of a stuck skeleton.
  if (isPublic && merchantQ.isSuccess && !merchant) {
    return (
      <MobileShell nav={false}>
        <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-stone-100">
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
    <MobileShell homeTo={homeTo}>
      {/* header row */}
      <header className="glass-header sticky top-0 z-30 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1">
          {/* Merchant previewing their own store via "View as buyer" — give
              them a way back that isn't the browser back button. */}
          {!isPublic && session?.accountType === "merchant" && (
            <Link
              to="/dashboard"
              aria-label="Back to dashboard"
              className="flex size-9 items-center justify-center rounded-full text-ink hover:bg-stone-100"
            >
              <ArrowLeft className="size-5" />
            </Link>
          )}
          <span className="text-lg font-extrabold tracking-tight text-primary">PulseShop</span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Search products"
            onClick={() => setSearchOpen((v) => !v)}
            className={cn(
              "flex size-10 items-center justify-center rounded-full transition-colors",
              searchOpen ? "bg-primary text-white" : "text-ink hover:bg-stone-100",
            )}
          >
            <Search className="size-5" />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="px-4 pt-3 animate-grid-fade">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="h-11 w-full rounded-btn border border-stone-200 bg-card px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}

      {/* store banner */}
      {merchant?.bannerUrl && (
        <div className="h-28 w-full overflow-hidden">
          <img src={merchant.bannerUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      {/* merchant hero */}
      <section className={cn("px-4", merchant?.bannerUrl ? "pt-0" : "pt-5")}>
        {merchant ? (
          <div className="flex flex-col items-center text-center">
            <div className={cn("relative", merchant.bannerUrl && "-mt-10")}>
              <img
                src={merchant.avatarUrl}
                alt={merchant.name}
                className="size-20 rounded-full object-cover ring-4 ring-card shadow-soft"
              />
              {merchant.isOnline && (
                <span className="absolute bottom-1 right-1 flex size-4">
                  <span className="absolute inline-flex size-full rounded-full bg-success animate-ping-slow" />
                  <span className="relative inline-flex size-4 rounded-full border-2 border-card bg-success" />
                </span>
              )}
            </div>
            <h1 className="mt-3 text-xl font-extrabold text-ink">{merchant.name}</h1>
            <p className="text-sm text-muted">
              @{merchant.handle} · {merchant.location}
            </p>
            <p className="mt-2 max-w-xs text-sm text-ink/80">{merchant.bio}</p>

            <div className="mt-4 flex w-full max-w-xs justify-between rounded-card bg-card px-6 py-3 shadow-soft">
              <Stat icon={<Package className="size-4 text-primary" />} value={merchant.stats.products} label="Products" />
              <Stat icon={<ShoppingBag className="size-4 text-primary" />} value={merchant.stats.orders} label="Orders" />
              <Stat icon={<Star className="size-4 fill-amber-400 text-amber-400" />} value={merchant.stats.rating.toFixed(1)} label="Rating" />
              </div>

            <div className="mt-4 flex items-center gap-2">
              {/* follow only makes sense on someone else's shop */}
              {isPublic && session?.id !== merchant.id && (
                <FollowButton merchantId={merchant.id} className="h-11 px-5" />
              )}
              <SocialLinks links={merchantSocialLinks(merchant)} ariaPrefix="Chat on" size="size-11" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-6 w-40 rounded" />
            <Skeleton className="h-4 w-56 rounded" />
            <Skeleton className="h-14 w-full max-w-xs" />
          </div>
        )}
      </section>

      {/* category pills */}
      <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto px-4 pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={cn(
              "flex-shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              cat === category
                ? "bg-primary text-white"
                : "bg-card text-muted shadow-soft hover:text-ink",
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* product grid */}
      <section className="px-4 pb-6 pt-4">
        {productsQ.isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : productsQ.isError ? (
          <div className="rounded-card bg-card p-8 text-center shadow-soft">
            <p className="font-semibold text-ink">Couldn't load products</p>
            <button
              type="button"
              onClick={() => productsQ.refetch()}
              className="mt-3 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-card bg-card p-8 text-center shadow-soft">
            <p className="font-semibold text-ink">No products found</p>
            <p className="mt-1 text-sm text-muted">Try a different category or search.</p>
          </div>
        ) : (
          <div key={`${category}-${search}`} className="grid grid-cols-2 gap-3 animate-grid-fade">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </MobileShell>
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
