import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Heart, Minus, Plus, Search, ShoppingBag, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { MobileShell } from "@/components/layout/MobileShell";
import { Gallery } from "@/components/product/Gallery";
import { ProductCard } from "@/components/product/ProductCard";
import { RatingRow } from "@/components/product/RatingRow";
import { ReviewsSection } from "@/components/product/ReviewsSection";
import { ShareMenu } from "@/components/product/ShareMenu";
import { ColorSelector } from "@/components/product/ColorSelector";
import { SizeSelector } from "@/components/product/SizeSelector";
import { StockBadge, stockDetailLabel } from "@/components/product/StockBadge";
import { Button } from "@/components/ui/Button";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/BrandIcons";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { SocialLinks } from "@/components/shop/SocialLinks";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  formatKes,
  hasPriceRange,
  listPriceForSelection,
  priceForSelection,
  variantPrice,
} from "@/lib/currency";
import { merchantSocialLinks, productInquiryLinks } from "@/lib/deeplinks";
import { productSeo } from "@/lib/seo";
import { seoProductFrom } from "@/lib/seoFrom";
import { useSeo } from "@/hooks/useSeo";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { Product } from "@/types";
import { useAddToCart } from "@/hooks/useCart";
import { useFavoriteToggle } from "@/hooks/useFavorites";
import { useAuth } from "@/stores/auth";
import { cartCount, useCart } from "@/stores/cart";
import { useFavorites } from "@/stores/favorites";
import { useOrderStore } from "@/stores/order";
import { useShop, useShopHome } from "@/stores/shop";
import { useToasts } from "@/stores/toast";

type Channel = "whatsapp" | "instagram" | "facebook";

const CHANNELS: { id: Channel; label: string; icon: typeof WhatsAppIcon }[] = [
  { id: "whatsapp", label: "WhatsApp", icon: WhatsAppIcon },
  { id: "instagram", label: "Instagram", icon: InstagramIcon },
  { id: "facebook", label: "Facebook", icon: FacebookIcon },
];

export function ProductDetailPage() {
  // Two routes land here: the canonical `/:shopSlug/:productSlug` and the
  // legacy `/product/:id`, which is still reachable from links shared before
  // slugs existed.
  const { id: legacyId, shopSlug: shopParam, productSlug } = useParams();
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);
  const home = useShopHome();
  const setShopSlug = useShop((s) => s.setSlug);
  const session = useAuth((s) => s.session);
  const qc = useQueryClient();
 

  const productQ = useQuery({
    queryKey: legacyId ? ["product", legacyId] : ["product-by-slug", shopParam, productSlug],
    queryFn: () =>
      legacyId
        ? services.products.getProduct(legacyId)
        : services.products.getProductBySlug(shopParam!, productSlug!),
  });
  const product = productQ.data;
  // Everything downstream keys off the loaded product rather than a URL param,
  // so it no longer matters which of the two routes we arrived by.
  const id = product?.id ?? "";

  /**
   * Collapse a legacy URL onto the canonical one.
   *
   * `replace` rather than `push`: the shopper pressed back to leave the page
   * they came from, not to bounce between two spellings of this one. A hard
   * load of the same URL is 301'd server-side before React ever runs — this
   * only covers navigation inside the app.
   */
  const canonicalPath = product?.shopSlug && product.slug
    ? `/${product.shopSlug}/${product.slug}`
    : null;
  useEffect(() => {
    if (legacyId && canonicalPath) navigate(canonicalPath, { replace: true });
  }, [legacyId, canonicalPath, navigate]);

  // The product carries its owning shop's handle — use it to load the right
  // merchant (for contact/order routing) and remember it as the active shop.
  const shopSlug = product?.shopSlug ?? null;
  useEffect(() => {
    if (shopSlug) setShopSlug(shopSlug);
  }, [shopSlug, setShopSlug]);

  const merchantQ = useQuery({
    queryKey: ["shop", shopSlug],
    queryFn: () => services.products.getShop(shopSlug!),
    enabled: Boolean(shopSlug),
  });

  const isFavorite = useFavorites((s) => s.isFavorite(id));
  const toggle = useFavoriteToggle();
  const addToCart = useAddToCart();
  const cartItems = useCart((s) => s.items);
  const cartItemCount = cartCount(cartItems);
  const {
    selectedSize,
    setSelectedSize,
    selectedColor,
    setSelectedColor,
    qty,
    setQty,
    setPreferredChannel,
  } = useOrderStore();
  const [localSize, setLocalSize] = useState<string | null>(null);
  const [localColor, setLocalColor] = useState<string | null>(null);

  // Desktop-only inline order flow (channel picker lives on the page itself
  // instead of only on OrderPage) — default to the seller's first configured
  // channel once merchant data loads.
  const [desktopChannel, setDesktopChannel] = useState<Channel | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  const merchant = merchantQ.data;
  // A merchant can't rate their own product — the DB rejects it too.
  const ownsProduct = Boolean(session && merchant && session.id === merchant.id);

  useEffect(() => {
    if (!merchant || desktopChannel) return;
    const firstAvailable = CHANNELS.find((c) => merchant.contacts[c.id]);
    if (firstAvailable) setDesktopChannel(firstAvailable.id);
  }, [merchant, desktopChannel]);

  // Related products: same shop, same category first, other categories fill any
  // remaining slots — sellers pick their own free-text categories, so there's no
  // fixed taxonomy to map "Gaming Consoles" to "Electronics" against.
  //
  // Two *bounded* queries (7 rows each — one more than the 6 slots, so there's a
  // spare once the product itself is filtered out) rather than the single
  // unbounded fetch of the shop's whole catalogue this used to do just to pick
  // six cards off the top.
  const RELATED = 6;

  const sameCategoryQ = useQuery({
    queryKey: ["related", merchant?.id, product?.category],
    queryFn: () =>
      services.products.listShopProducts(merchant!.id, {
        category: product!.category,
        pageSize: RELATED + 1,
      }),
    enabled: Boolean(merchant && product),
  });

  const shopFillQ = useQuery({
    queryKey: ["related-fill", merchant?.id],
    queryFn: () => services.products.listShopProducts(merchant!.id, { pageSize: RELATED + 1 }),
    enabled: Boolean(merchant && product),
  });

  const relatedProducts = useMemo(() => {
    if (!product) return [];
    const seen = new Set([product.id]);
    const out: Product[] = [];
    for (const p of [...(sameCategoryQ.data?.items ?? []), ...(shopFillQ.data?.items ?? [])]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
      if (out.length === RELATED) break;
    }
    return out;
  }, [sameCategoryQ.data, shopFillQ.data, product]);

  // Sellers write one detail per line (the dashboard form says so); each line
  // renders as a bullet. Legacy descriptions written as a single paragraph are
  // split on "Word(s):" style labels, e.g. "...Portability: Extremely thin..."
  // → break before "Portability:", so they read as bullets too.
  const descriptionBullets = useMemo(() => {
    if (!product?.description) return [];
    return product.description
      .replace(/(?<=[.;])\s+(?=[A-Z][a-zA-Z &]{2,30}:)/g, "\n")
      .split(/\n+/)
      // a seller may type their own "- " or "• " markers — we add the bullet
      .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
      .filter(Boolean);
  }, [product?.description]);

  

  const [searchOpen, setSearchOpen] = useState(false);
  // Title/OG/JSON-LD for an in-app navigation. A cold load already arrived with
  // these baked in by api/render.ts; this keeps them right once React Router is
  // driving. Held back until BOTH the product and its shop have loaded — a
  // half-built title is worse than the previous page's for the 200ms it takes.
  useSeo(
    useMemo(
      () =>
        product && merchant
          ? productSeo(seoProductFrom(product, merchant), window.location.origin)
          : null,
      [product, merchant],
    ),
  );

  const [searchQuery, setSearchQuery] = useState("");
  const submitSearch = () => {
    if (!searchQuery.trim()) return;
    navigate(`${home}?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const myRatingQ = useQuery({
    queryKey: ["my-rating", id],
    queryFn: () => services.reviews.getMyRating(id),
    // `id` now comes from the loaded product, so this has to wait for it.
    enabled: Boolean(id) && Boolean(session) && !ownsProduct,
  });

  // Only a buyer who ordered this product may rate/review it (migration 0029).
  // RLS is the real boundary; this decides whether the UI even offers the stars.
  const canReviewQ = useQuery({
    queryKey: ["can-review", id],
    queryFn: () => services.reviews.canReview(id),
    enabled: Boolean(id) && Boolean(session) && !ownsProduct,
  });
  const canReview = canReviewQ.data ?? false;

  // The product's average is recomputed server-side — refetch, don't guess.
  // Invalidate both cache keys: the page may have been reached by either route,
  // and only one of them is the key this instance is reading.
  const invalidateProduct = () => {
    qc.invalidateQueries({ queryKey: ["product", id] });
    qc.invalidateQueries({ queryKey: ["product-by-slug", shopParam, productSlug] });
  };

  const rateMut = useMutation({
    mutationFn: (stars: number) => services.reviews.rateProduct(id, stars),
    onSuccess: (_data, stars) => {
      invalidateProduct();
      qc.setQueryData(["my-rating", id], stars);
      push(`You rated this ${stars} ${stars === 1 ? "star" : "stars"}`, "success");
    },
    onError: () => push("Couldn't save your rating — try again", "danger"),
  });

  const rate = (stars: number) => {
    if (!session) {
      push("Sign in to rate this product");
      navigate("/login");
      return;
    }
    rateMut.mutate(stars);
  };

  if (productQ.isLoading) {
    return (
      <MobileShell homeTo={home}>
        <div className="space-y-4 p-4">
          <Skeleton className="mx-auto aspect-square w-full max-w-[320px]" />
          <Skeleton className="h-6 w-2/3 rounded" />
          <Skeleton className="h-5 w-1/3 rounded" />
          <Skeleton className="h-24 w-full" />
        </div>
      </MobileShell>
    );
  }

  if (!product) {
    return (
      <MobileShell homeTo={home}>
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-lg font-bold text-ink">Product not found</p>
          <Link to={home} className="font-semibold text-primary">
            Back to store
          </Link>
        </div>
      </MobileShell>
    );
  }

  const size = localSize ?? (product.sizes?.includes(selectedSize ?? "") ? selectedSize : null);
  const color = localColor ?? (product.colors?.includes(selectedColor ?? "") ? selectedColor : null);
  const soldOut = product.status === "out";
  const links = merchant ? productInquiryLinks(merchant, product) : null;

  const hasSizes = Boolean(product.sizes?.length);
  const hasColors = Boolean(product.colors?.length);

  /**
   * The headline price tracks the selection. Anything not yet chosen counts at
   * its CHEAPEST option and the figure is labelled "from", so it only ever
   * climbs as the shopper picks — quoting the base price and then revising
   * upward at the cart reads as a bait-and-switch even when it isn't one.
   */
  const shownPrice = priceForSelection(product, size, color);
  const shownListPrice = listPriceForSelection(product, size, color);
  const choicePending = (hasSizes && !size) || (hasColors && !color);
  const showFrom = choicePending && hasPriceRange(product);

  /**
   * The rule: whatever the seller offers a choice of, the buyer must choose,
   * before adding to the cart OR placing an order. Returns false and says which
   * one is missing — "select an option" on a page with two of them is a riddle.
   */
  const requireChoices = (): boolean => {
    const missing = [hasSizes && !size ? "size" : null, hasColors && !color ? "colour" : null]
      .filter(Boolean)
      .join(" and ");
    if (!missing) return true;
    push(`Please select a ${missing} first`);
    return false;
  };

  const orderNow = () => {
    if (!requireChoices()) return;
    setSelectedSize(size);
    setSelectedColor(color);
    navigate(`/order/${product.id}`);
  };

  // Desktop's inline channel picker — same validation as orderNow, plus
  // carries the chosen channel into OrderPage instead of defaulting there.
  const orderViaChannel = () => {
    if (!requireChoices()) return;
    setSelectedSize(size);
    setSelectedColor(color);
    setPreferredChannel(desktopChannel);
    navigate(`/order/${product.id}`);
  };


  const handleAddToCart = () => {
    if (!requireChoices()) return;
    if (!product.shopSlug) {
      push("Couldn't work out this product's shop — try again", "danger");
      return;
    }
    const added = addToCart(
      {
        productId: product.id,
        shopSlug: product.shopSlug,
        name: product.name,
        image: product.images[0],
        unitPrice: variantPrice(product, size, color),
        size,
        color,
        stockQty: product.stockQty,
      },
      qty,
    );
    if (!added) {
      push("Your cart has items from another shop — check out or clear it first", "danger");
      return;
    }
    push("Added to cart — keep shopping", "success");
  };

  const desktopChannelLabel = desktopChannel && CHANNELS.find((c) => c.id === desktopChannel)?.label;
  const desktopLinks = merchant ? merchantSocialLinks(merchant) : [];

  return (
    <MobileShell nav={false} wide>
      {/* header */}
      <header className="glass-header sticky top-0 z-30 flex items-center justify-between px-3 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {/* mobile's back lives in the floating button (MobileShell) */}
          <button
            type="button"
            aria-label="Go back"
            onClick={() => navigate(-1)}
            className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:flex lg:hover:bg-stone-100"
          >
            <ArrowLeft className="size-5" />
          </button>
          <span className="max-w-[55%] truncate text-sm font-bold text-ink lg:hidden">
            {product.name}
          </span>
          {merchant && (
            <Link to={home} className="hidden min-w-0 items-center gap-2.5 lg:flex">
              <img src={merchant.avatarUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
              <span className="truncate text-sm font-extrabold text-ink">{merchant.name}</span>
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1 lg:gap-2">
          <button
            type="button"
            aria-label="Search products"
            onClick={() => setSearchOpen((v) => !v)}
            className={cn(
              "flex size-10 items-center justify-center rounded-full shadow-soft transition-colors lg:shadow-none",
              searchOpen ? "bg-primary text-white" : "bg-card text-ink lg:bg-transparent lg:hover:bg-stone-100",
            )}
          >
            <Search className="size-5" />
          </button>
          <Link
            to="/favorites"
            aria-label="Favorites"
            className="hidden size-10 items-center justify-center rounded-full text-ink hover:bg-stone-100 lg:flex"
          >
            <Heart className="size-5" />
          </Link>
          <Link
            to="/cart"
            aria-label="Cart"
            className="relative hidden size-10 items-center justify-center rounded-full text-ink hover:bg-stone-100 lg:flex"
          >
            <ShoppingBag className="size-5" />
            {cartItemCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-favorite text-[10px] font-bold text-white">
                {cartItemCount}
              </span>
            )}
          </Link>
          {/* Account stays reachable even here, where the bottom nav is hidden and
              most shoppers land cold from a shared link. Visible on mobile too —
              the favorites/cart icons above are desktop-only. */}
          <Link
            to="/account"
            aria-label="Account"
            className="flex size-10 items-center justify-center rounded-full bg-card text-ink shadow-soft transition-colors hover:bg-stone-100 lg:bg-transparent lg:shadow-none"
          >
            <UserRound className="size-5" />
          </Link>
          {desktopLinks.length > 0 && (
            <div className="ml-1 hidden items-center gap-1.5 border-l border-stone-200 pl-3 lg:flex">
              <SocialLinks links={desktopLinks} ariaPrefix="Chat on" size="size-9" iconSize="size-4" />
            </div>
          )}
        </div>
      </header>

      {searchOpen && (
        <div className="px-4 pt-3 animate-grid-fade lg:px-6">
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitSearch()}
            placeholder="Search products…"
            className="h-11 w-full max-w-md rounded-btn border border-stone-200 bg-card px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}

      {/* mobile's bottom clearance (action bar + floating back) comes from MobileShell */}
      <div className="px-4 pt-2 lg:px-6 lg:pb-14 lg:pt-6">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
          {/* gallery */}
          {/* square frame, sized down from full-bleed — matches the square
              crop the shop grid shows, so the photo reads the same on both */}
          <Gallery
            images={product.images}
            alt={product.name}
            frameClassName="mx-auto aspect-square w-full max-w-[320px] lg:mx-0 lg:max-w-md"
            thumbnails
            thumbnailsClassName="hidden lg:flex"
          />

          {/* info + desktop order panel */}
          <div className="mt-3.5 space-y-3.5 lg:mt-0 lg:space-y-4">
            <nav className="flex items-center gap-1 text-xs font-medium text-muted">
              {/* Shoppers reach a product from within one shop; give them a way
                  back to the full shops list (the product page hides the bottom
                  nav, so there's no other route to it). Hidden for a merchant
                  previewing their own product — the shops list isn't their home. */}
              {!ownsProduct && (
                <>
                  <Link to="/shops" className="hover:text-primary">
                    Shops
                  </Link>
                  <ChevronRight className="size-3.5" />
                </>
              )}
              <Link to={home} className="hover:text-primary">
                Store
              </Link>
              <ChevronRight className="size-3.5" />
              <span>{product.category}</span>
            </nav>

            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-extrabold text-ink lg:text-2xl">{product.name}</h1>
              <div className="text-right">
                <p className="text-xl font-extrabold text-primary lg:text-2xl">
                  {showFrom && <span className="text-sm font-medium text-muted">from </span>}
                  {formatKes(shownPrice)}
                </p>
                {product.discountPct != null && (
                  <p className="text-sm text-muted line-through">{formatKes(shownListPrice)}</p>
                )}
              </div>
            </div>

            <RatingRow
              rating={product.rating}
              reviewCount={product.reviewCount}
              myRating={myRatingQ.data ?? null}
              onRate={!ownsProduct && canReview ? rate : undefined}
              pending={rateMut.isPending}
            />
            <StockBadge
              status={product.status}
              label={stockDetailLabel(product.status, product.stockQty)}
            />
            {descriptionBullets.length > 0 && (
              <div className="space-y-2 text-sm leading-relaxed text-ink/80">
                <ul className="list-disc space-y-1.5 pl-5 marker:text-primary">
                  {(descExpanded ? descriptionBullets : descriptionBullets.slice(0, 4)).map(
                    (line, i) => {
                      const match = line.match(/^([A-Z][a-zA-Z &]{2,30}:)\s*(.*)$/s);
                      return (
                        <li key={i}>
                          {match ? (
                            <>
                              <span className="font-bold text-ink">{match[1]}</span> {match[2]}
                            </>
                          ) : (
                            line
                          )}
                        </li>
                      );
                    },
                  )}
                </ul>
                {descriptionBullets.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((v) => !v)}
                    className="text-sm font-semibold text-primary"
                  >
                    {descExpanded ? "Show less" : `Show all ${descriptionBullets.length} details`}
                  </button>
                )}
              </div>
            )}
            {/* variant selectors — required before Add / Buy when present */}
            {hasSizes && (
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-ink">
                  Select Size <span className="font-medium text-muted">(required)</span>
                </h2>
                <SizeSelector sizes={product.sizes ?? []} value={size} onChange={setLocalSize} />
              </div>
            )}
            {hasColors && (
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-ink">
                  Select Colour <span className="font-medium text-muted">(required)</span>
                </h2>
                <ColorSelector
                  colors={product.colors ?? []}
                  value={color}
                  onChange={setLocalColor}
                />
              </div>
            )}

            {/* desktop-only: quantity + channel picker + order CTA, replacing
                the floating mobile bar with an inline panel like the mockup */}
            {!soldOut && (
              <div className="hidden space-y-4 rounded-card border border-stone-100 bg-card p-4 lg:block">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-ink">Quantity</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQty(qty - 1)}
                      disabled={qty <= 1}
                      className="flex size-8 items-center justify-center rounded-full bg-stone-100 disabled:opacity-40"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{qty}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQty(Math.min(qty + 1, product.stockQty))}
                      className="flex size-8 items-center justify-center rounded-full bg-stone-100"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>

                {desktopLinks.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 rounded-btn bg-stone-100 p-1">
                    {CHANNELS.map(({ id: ch, label, icon: Icon }) => {
                      const available = Boolean(merchant?.contacts[ch]);
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => available && setDesktopChannel(ch)}
                          disabled={!available}
                          aria-label={available ? label : `${label} — not set up by this seller`}
                          className={cn(
                            "flex h-10 items-center justify-center gap-1.5 rounded-[10px] text-xs font-bold transition-all",
                            !available && "cursor-not-allowed opacity-35",
                            available && desktopChannel === ch ? "bg-card text-ink shadow-soft" : "text-muted",
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4",
                              available && ch === "whatsapp" && "text-whatsapp",
                              available && ch === "instagram" && "text-instagram",
                              available && ch === "facebook" && "text-facebook",
                            )}
                          />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    size="lg"
                    className="max-w-sm flex-1"
                    onClick={orderViaChannel}
                    disabled={!desktopChannel}
                  >
                    Order Now
                  </Button>
                  <Button variant="outline" size="lg" onClick={handleAddToCart} aria-label="Add to cart">
                    <ShoppingBag className="size-5" />
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => toggle(product.id)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
                >
                  <Heart className={cn("size-4", isFavorite ? "fill-favorite text-favorite" : "text-ink")} />
                  {isFavorite ? "Saved to Wishlist" : "Add to Wishlist"}
                </button>

                {merchant && desktopChannelLabel && (
                  <p className="text-xs leading-relaxed text-muted">
                    After ordering, <span className="font-bold text-ink">{merchant.name}</span> will
                    confirm your order via{" "}
                    <span className="font-bold text-ink">{desktopChannelLabel}</span>.
                  </p>
                )}
              </div>
            )}

            {/* contact icons row — only channels the seller actually set up */}
            {links && links.length > 0 && (
              <div className="space-y-1.5 text-center lg:text-left">
                <div className="flex justify-center gap-4 lg:justify-start">
                  <SocialLinks links={links} ariaPrefix="Ask on" />
                </div>
                <p className="text-xs font-medium text-muted">Ask about this product</p>
              </div>
            )}
          </div>
        </div>

        <ReviewsSection
          productId={id}
          canReview={canReview}
          isOwner={ownsProduct}
          signedIn={Boolean(session)}
          myRating={myRatingQ.data ?? null}
          onRated={invalidateProduct}
        />

        {/* related products — same shop, same category first */}
        {relatedProducts.length > 0 && (
          <div className="mt-3.5 space-y-2 lg:mt-10">
            <h2 className="text-sm font-bold text-ink lg:text-base">You might also like</h2>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} className="w-40 shrink-0 lg:w-auto" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Other shops to jump to — this is exactly where the user gets stranded:
          deep in one shop's product with no route back to the directory. Hidden
          for a merchant previewing their own product. */}
      {!ownsProduct && <ShopFooter excludeId={merchant?.id} />}

      {/* primary CTA — the same flush glass ledge the tab bar uses (this page has
          no tab bar), so the product images scroll under it. Desktop uses the
          inline order panel above instead. */}
      <div className="glass-bar fixed-stable fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <div className="mx-auto flex max-w-[430px] items-center gap-1.5 px-3 py-2.5">
          <button
            type="button"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            onClick={() => toggle(product.id)}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/70 text-ink"
          >
            <Heart className={cn("size-4.5", isFavorite ? "fill-favorite text-favorite" : "text-ink")} />
          </button>
          <ShareMenu
            product={product}
            triggerClassName="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/70 text-ink"
          />
          <Button
            variant="outline"
            size="md"
            className="flex-1 whitespace-nowrap rounded-full border-white/60 bg-white/70 px-2"
            disabled={soldOut}
            onClick={handleAddToCart}
          >
            <ShoppingBag className="size-4.5" />
            Add
          </Button>
          <Button size="md" className="flex-1 whitespace-nowrap rounded-full px-2" disabled={soldOut} onClick={orderNow}>
            {soldOut ? "Sold Out" : "Buy Now"}
          </Button>
        </div>
      </div>
    </MobileShell>
  );
}
